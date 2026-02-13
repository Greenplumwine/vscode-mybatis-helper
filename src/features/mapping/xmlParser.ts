import { XMLParser } from 'fast-xml-parser';
import { XmlMapperInfo, SqlStatementInfo } from './types';
import * as vscode from 'vscode';

/**
 * MyBatis XML 解析器
 * 使用 fast-xml-parser 解析 XML Mapper 文件
 */
export class MyBatisXmlParser {
  private static instance: MyBatisXmlParser;
  private parser: XMLParser;
  private logger: any;

  private constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: false,
      trimValues: true,
      parseTagValue: false,
      processEntities: false,
      htmlEntities: false
    });
  }

  public static getInstance(): MyBatisXmlParser {
    if (!MyBatisXmlParser.instance) {
      MyBatisXmlParser.instance = new MyBatisXmlParser();
    }
    return MyBatisXmlParser.instance;
  }

  public async initialize(): Promise<void> {
    const { Logger } = await import('../../utils/logger.js');
    this.logger = Logger.getInstance();
  }

  /**
   * 解析 XML Mapper 文件
   */
  async parseXmlMapper(filePath: string): Promise<XmlMapperInfo | null> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const content = document.getText();

      const parsed = this.parser.parse(content);
      if (!parsed || !parsed.mapper) {
        return null;
      }

      const mapper = parsed.mapper;
      const namespace = mapper.namespace || '';

      if (!namespace) {
        this.logger?.debug(`No namespace found in ${filePath}`);
      }

      const statements = new Map<string, SqlStatementInfo>();
      const statementTypes = ['select', 'insert', 'update', 'delete'] as const;

      for (const type of statementTypes) {
        const elements = mapper[type];
        if (!elements) {
          continue;
        }

        const elementsArray = Array.isArray(elements) ? elements : [elements];

        for (const element of elementsArray) {
          if (typeof element === 'object' && element.id) {
            const position = this.findStatementPosition(content, type, element.id);
            statements.set(element.id, {
              id: element.id,
              type: type,
              line: position.line,
              column: position.column
            });
          }
        }
      }

      return {
        filePath,
        namespace,
        statements
      };
    } catch (error) {
      this.logger?.debug(`Failed to parse XML file ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * 查找 SQL 语句在文件中的位置
   */
  private findStatementPosition(content: string, type: string, id: string): { line: number; column: number } {
    const lines = content.split('\n');
    const tagRegex = new RegExp(`<${type}\\s+[^>]*id=["']${id}["']`, 'i');

    for (let i = 0; i < lines.length; i++) {
      const match = tagRegex.exec(lines[i]);
      if (match) {
        return {
          line: i,
          column: match.index
        };
      }
    }

    return { line: 0, column: 0 };
  }

  /**
   * 解析 mybatis-config.xml 文件
   * 提取 mappers 配置
   */
  async parseMyBatisConfig(filePath: string): Promise<string[] | null> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const content = document.getText();

      const parsed = this.parser.parse(content);
      if (!parsed || !parsed.configuration) {
        return null;
      }

      const mappers = parsed.configuration.mappers;
      if (!mappers) {
        return null;
      }

      const locations: string[] = [];
      const mapperElements = mappers.mapper || [];
      const elementsArray = Array.isArray(mapperElements) ? mapperElements : [mapperElements];

      for (const element of elementsArray) {
        if (typeof element === 'object') {
          if (element.resource) {
            locations.push(element.resource);
          }
          if (element.class) {
            locations.push(element.class);
          }
          if (element.url) {
            locations.push(element.url);
          }
        }
      }

      return locations;
    } catch (error) {
      this.logger?.debug(`Failed to parse mybatis-config.xml ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * 从 YAML 内容解析 mapper-locations
   */
  parseMapperLocationsFromYaml(content: string): string[] {
    const locations: string[] = [];

    const lines = content.split('\n');
    let inMybatisSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('mybatis:')) {
        inMybatisSection = true;
        continue;
      }

      if (inMybatisSection) {
        if (trimmed.startsWith('mapper-locations:')) {
          const value = trimmed.split(':')[1]?.trim();
          if (value) {
            locations.push(value.replace(/["']/g, ''));
          }
        } else if (trimmed.startsWith('- ') && locations.length > 0) {
          const value = trimmed.substring(2).trim();
          locations.push(value.replace(/["']/g, ''));
        } else if (!trimmed.startsWith('#') && trimmed.length > 0 && !trimmed.startsWith('mybatis')) {
          if (!line.startsWith(' ') && !line.startsWith('\t')) {
            inMybatisSection = false;
          }
        }
      }
    }

    return locations;
  }

  /**
   * 从 Properties 内容解析 mapper-locations
   */
  parseMapperLocationsFromProperties(content: string): string[] {
    const locations: string[] = [];

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('mybatis.mapper-locations=')) {
        const value = trimmed.split('=')[1];
        if (value) {
          locations.push(value.trim());
        }
      }
    }

    return locations;
  }
}
