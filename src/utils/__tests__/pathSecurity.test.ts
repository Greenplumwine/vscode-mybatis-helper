import { sanitizeClassPath, sanitizeJarPath, isValidClassName, sanitizeFilePath } from '../pathSecurity';
import * as fs from 'fs';
import * as path from 'path';

describe('pathSecurity', () => {
    const testDir = path.join(__dirname, 'test-fixtures');

    beforeAll(() => {
        // 创建测试夹具
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        fs.writeFileSync(path.join(testDir, 'Test.class'), 'fake class content');
        fs.writeFileSync(path.join(testDir, 'test.jar'), 'fake jar content');
        fs.writeFileSync(path.join(testDir, 'test.txt'), 'text content');
    });

    afterAll(() => {
        // 清理
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    describe('sanitizeClassPath', () => {
        it('should return absolute path for valid .class file', () => {
            const result = sanitizeClassPath(path.join(testDir, 'Test.class'));
            expect(result).toBe(path.join(testDir, 'Test.class'));
        });

        it('should return null for non-existent file', () => {
            const result = sanitizeClassPath(path.join(testDir, 'NonExistent.class'));
            expect(result).toBeNull();
        });

        it('should return null for wrong extension', () => {
            const result = sanitizeClassPath(path.join(testDir, 'test.txt'));
            expect(result).toBeNull();
        });

        it('should resolve relative paths', () => {
            const relativePath = path.relative(process.cwd(), path.join(testDir, 'Test.class'));
            const result = sanitizeClassPath(relativePath);
            expect(result).toBe(path.join(testDir, 'Test.class'));
        });

        it('should return null for empty string', () => {
            expect(sanitizeClassPath('')).toBeNull();
        });

        it('should return null for directory', () => {
            expect(sanitizeClassPath(testDir)).toBeNull();
        });
    });

    describe('sanitizeJarPath', () => {
        it('should return absolute path for valid .jar file', () => {
            const result = sanitizeJarPath(path.join(testDir, 'test.jar'));
            expect(result).toBe(path.join(testDir, 'test.jar'));
        });

        it('should return null for non-existent jar', () => {
            const result = sanitizeJarPath(path.join(testDir, 'nonexistent.jar'));
            expect(result).toBeNull();
        });

        it('should return null for .class file passed as jar', () => {
            const result = sanitizeJarPath(path.join(testDir, 'Test.class'));
            expect(result).toBeNull();
        });

        it('should return null for empty string', () => {
            expect(sanitizeJarPath('')).toBeNull();
        });
    });

    describe('isValidClassName', () => {
        it('should return true for valid class names', () => {
            expect(isValidClassName('UserMapper')).toBe(true);
            expect(isValidClassName('com.example.UserMapper')).toBe(true);
            expect(isValidClassName('User$InnerClass')).toBe(true);
            expect(isValidClassName('_PrivateClass')).toBe(true);
        });

        it('should return false for invalid class names', () => {
            expect(isValidClassName('')).toBe(false);
            expect(isValidClassName('User Mapper')).toBe(false);
            expect(isValidClassName('User;Mapper')).toBe(false);
            expect(isValidClassName('User|Mapper')).toBe(false);
            expect(isValidClassName('User&&Mapper')).toBe(false);
            expect(isValidClassName('`whoami`')).toBe(false);
        });

        it('should return false for command injection attempts', () => {
            expect(isValidClassName('User;rm -rf /')).toBe(false);
            expect(isValidClassName('User&&cat /etc/passwd')).toBe(false);
            expect(isValidClassName('User|ls')).toBe(false);
        });
    });

    describe('sanitizeFilePath', () => {
        it('should return path for valid file without extension filter', () => {
            const result = sanitizeFilePath(path.join(testDir, 'test.txt'));
            expect(result).toBe(path.join(testDir, 'test.txt'));
        });

        it('should return path for file with allowed extension', () => {
            const result = sanitizeFilePath(path.join(testDir, 'test.txt'), ['.txt']);
            expect(result).toBe(path.join(testDir, 'test.txt'));
        });

        it('should return null for file with disallowed extension', () => {
            const result = sanitizeFilePath(path.join(testDir, 'Test.class'), ['.txt', '.xml']);
            expect(result).toBeNull();
        });

        it('should return null for non-existent file', () => {
            expect(sanitizeFilePath(path.join(testDir, 'nonexistent.txt'))).toBeNull();
        });

        it('should be case insensitive for extensions', () => {
            fs.writeFileSync(path.join(testDir, 'test.XML'), '<xml/>');
            const result = sanitizeFilePath(path.join(testDir, 'test.XML'), ['.xml']);
            expect(result).toBe(path.join(testDir, 'test.XML'));
            fs.unlinkSync(path.join(testDir, 'test.XML'));
        });
    });
});
