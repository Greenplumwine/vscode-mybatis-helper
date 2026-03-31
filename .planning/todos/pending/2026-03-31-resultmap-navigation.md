---
created: 2026-03-31T06:52:13.820Z
title: MyBatis XML resultMap 标签内跳转支持
area: navigation
files:
  - src/features/mapping/
  - src/features/navigation/
---

## Problem

当前 MyBatis Helper 不支持在 resultMap 标签内部进行导航跳转，开发者需要手动查找类定义和字段位置：

1. **type 属性跳转缺失**：点击 `<resultMap type="com.example.User">` 中的类名无法跳转到对应 Java 类
2. **property 属性跳转缺失**：点击 `<result property="name" column="user_name">` 中的 property 无法跳转到实体类字段
3. **继承关系处理缺失**：当字段在当前类不存在但在父类存在时，无法自动跳转到父类

## Solution

### 功能需求

1. **type 属性跳转**
   - 支持从 `type` 属性值跳转到对应的 Java 类定义
   - 支持别名解析（通过 mybatis-config.xml 中的 typeAliases）

2. **property 属性跳转**
   - 支持从 `property` 属性跳转到实体类字段
   - 支持 getter/setter 方法跳转（可选）

3. **继承层级处理**
   ```
   查找顺序：
   1. 当前类字段
   2. 当前类 getter/setter
   3. 父类字段
   4. 父类 getter/setter
   5. 逐级向上直到 Object
   ```

### 支持标签

| 标签 | 跳转属性 | 目标 |
|------|---------|------|
| `<resultMap>` | `type` | Java 类 |
| `<result>` | `property` | 类字段 |
| `<id>` | `property` | 类字段 |
| `<association>` | `property` | 类字段 |
| `<collection>` | `property` | 类字段 |
| `<discriminator>` | `javaType` | Java 类 |
| `<case>` | `resultType` | Java 类 |

### 技术实现

1. **CodeLensProvider 扩展**
   - 在 resultMap 相关标签上添加 CodeLens
   - 显示 "跳转到类"、"跳转到字段" 等提示

2. **DefinitionProvider 扩展**
   - 支持 Ctrl+Click 直接跳转
   - 处理别名解析

3. **继承解析**
   - 使用 JDTLS 或自研解析器获取类继承链
   - 缓存类层级信息

### 边界情况

- 字段不存在：显示警告提示
- 循环继承：检测并防止死循环
- 泛型类型：正确处理泛型参数
