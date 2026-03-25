# MyBatis Helper - Feature Documentation

Detailed documentation for all MyBatis Helper features.

---

## Table of Contents

1. [Java-XML Navigation](#java-xml-navigation)
2. [SQL Interceptor](#sql-interceptor)
3. [Code Completion](#code-completion)
4. [Code Generation](#code-generation)
5. [Formatting](#formatting)
6. [CodeLens](#codelens)

---

## Java-XML Navigation

Bidirectional navigation between Java Mapper interfaces and XML files.

### Java to XML

Jump from Java method to corresponding XML SQL statement.

**Shortcuts:**
- Windows/Linux: `Ctrl+Alt+J`
- macOS: `Ctrl+Option+J`

**Context Menu:**
Right-click in editor → "Jump to XML File"

**Requirements:**
- Cursor on method name or interface name
- File must be a Mapper interface (`*Mapper.java`, `*Dao.java`)
- XML file with matching namespace must exist

### XML to Java

Jump from XML SQL id to corresponding Java method.

**Shortcuts:**
- Windows/Linux: `Ctrl+Alt+X`
- macOS: `Ctrl+Option+X`

**Context Menu:**
Right-click on id attribute → "Jump to Mapper Interface"

**Requirements:**
- Cursor on `id` attribute value of `<select>`, `<insert>`, `<update>`, or `<delete>`
- XML must have valid namespace matching Java class

### Navigation Algorithm

The extension uses a multi-layer matching system:

1. **Exact Match:** Namespace matches fully qualified class name
2. **Pattern Match:** Custom name matching rules
3. **Path Priority:** Prioritizes certain directories
4. **Suffix Stripping:** Removes common suffixes (Mapper, Dao, etc.)

### Configuration Options

```json
{
  "mybatis-helper.nameMatchingRules": [
    {
      "name": "Custom Pattern",
      "enabled": true,
      "javaPattern": "*Repository",
      "xmlPattern": "${javaName}Mapper"
    }
  ],
  "mybatis-helper.ignoreSuffixes": ["Mapper", "Dao", "Repository"],
  "mybatis-helper.fileOpenMode": "useExisting"
}
```

---

## SQL Interceptor

Real-time capture and display of MyBatis SQL statements.

### How It Works

1. Monitors Debug Console or Terminal output
2. Detects MyBatis log patterns (`Preparing:`, `Parameters:`)
3. Parses SQL and parameters
4. Replaces `?` placeholders with actual values
5. Displays formatted SQL in sidebar

### Listen Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `auto` | Automatically detect based on Java debug config | Recommended |
| `debugConsole` | Force listen to Debug Console | `internalConsole` mode |
| `terminal` | Force listen to Terminal | `integratedTerminal` mode |

### Supported Log Formats

**Standard MyBatis:**
```
==>  Preparing: SELECT * FROM user WHERE id = ?
==> Parameters: 123(Integer), admin(String)
<==      Total: 1
```

**With Timestamp:**
```
2024-01-15 10:30:25.123 DEBUG c.m.UserMapper.selectById - ==>  Preparing: SELECT...
```

**Chinese Brackets:**
```
==> Parameters: admin（String）, 25(Integer)
```

### Custom Parsing Rules

For non-standard log formats:

```json
{
  "mybatis-helper.sqlInterceptor.customRules": [
    {
      "name": "my-format",
      "enabled": true,
      "lineMatchRegex": "SQL:",
      "sqlExtractRegex": "SQL:\\s*(.+)",
      "parametersExtractRegex": "PARAMS:\\s*(.+)",
      "paramParseRegex": "([^,]+)\\(([^)]+)\\)"
    }
  ]
}
```

### SQL History Features

- **Auto-scroll:** Configurable scroll behavior
- **One-click copy:** Copy formatted or raw SQL
- **Parameter display:** View parameter values and types
- **Execution time:** Shows SQL execution duration
- **History limit:** Configurable (10-1000 statements)

---

## Code Completion

Intelligent SQL completion in MyBatis XML files.

### Trigger Conditions

Completion activates when typing:
- `#{` - Parameter placeholder
- `${` - Literal placeholder
- Inside SQL statements

### Completion Types

**Basic Parameters:**
```xml
<select id="findById">
    SELECT * FROM user WHERE id = #{id}
                                              <!-- Shows: id -->
</select>
```

**Object Properties:**
```xml
<insert id="insert">
    INSERT INTO users (name, email)
    VALUES (#{user.name}, #{user.email})
                  <!-- Shows: name, email after typing "user." -->
</insert>
```

**Collection Items:**
```xml
<select id="findByIds">
    SELECT * FROM user WHERE id IN
    <foreach collection="ids" item="item">
        #{item}
          <!-- Shows: item -->
    </foreach>
</select>
```

### How It Works

1. Parses Java method signature from namespace
2. Extracts parameter names and types
3. Analyzes `@Param` annotations
4. Provides context-aware suggestions

### Requirements

- XML must have valid namespace
- Java file must be accessible
- Method signature must be parseable

---

## Code Generation

Generate XML methods from Java method signatures.

### Generate XML Method

Creates SQL statement template from Java method.

**Shortcut:** `Ctrl+Shift+G` (Windows/Linux) / `Cmd+Shift+G` (macOS)

**Context Menu:** Right-click in Java file → "Generate XML Method"

**Example:**

Java method:
```java
List<User> findByName(@Param("name") String name);
```

Generated XML:
```xml
<select id="findByName" resultType="com.example.User">
    SELECT * FROM users WHERE name = #{name}
</select>
```

### Create Mapper XML

Creates complete XML file from Java Mapper interface.

**Context Menu:** Right-click on Java file in Explorer → "Create Mapper XML"

**Generates:**
- XML file with correct namespace
- DOCTYPE declaration
- Empty mapper element

### Templates

The extension uses built-in templates:

**SELECT:**
```xml
<select id="{methodName}" resultType="{returnType}">
    SELECT * FROM {table} WHERE {condition}
</select>
```

**INSERT:**
```xml
<insert id="{methodName}">
    INSERT INTO {table} ({columns})
    VALUES ({values})
</insert>
```

**UPDATE:**
```xml
<update id="{methodName}">
    UPDATE {table} SET {columns} WHERE {condition}
</update>
```

**DELETE:**
```xml
<delete id="{methodName}">
    DELETE FROM {table} WHERE {condition}
</delete>
```

---

## Formatting

SQL and XML formatting support.

### SQL Formatting

Formats SQL statements with proper indentation and line breaks.

**Supported Dialects:**
- MySQL / MariaDB
- PostgreSQL
- Oracle
- SQL Server (T-SQL)
- SQLite
- DB2

**Configuration:**
```json
{
  "mybatis-helper.formatting.sql.dialect": "mysql",
  "mybatis-helper.formatting.sql.keywordCase": "upper",
  "mybatis-helper.formatting.sql.maxLineLength": 120
}
```

**Example:**
```sql
-- Before
select id,name,email from users where id=? and status='active'

-- After
SELECT
  id,
  name,
  email
FROM
  users
WHERE
  id = ?
  AND status = 'active'
```

### XML Formatting

Formats MyBatis XML files with proper nesting.

**Features:**
- Indentation control
- Attribute alignment
- CDATA preservation
- SQL block handling

---

## CodeLens

Inline navigation hints above Java methods.

### What It Shows

Above each mapper method:
```java
Jump to XML
public User findById(Long id);
```

Click "Jump to XML" to navigate directly.

### Configuration

```json
{
  "mybatis-helper.enableCodeLens": true
}
```

### When It Appears

CodeLens shows only when:
1. File is a Mapper interface
2. Corresponding XML file exists
3. Method has matching SQL id

### Performance Note

CodeLens is computed asynchronously and cached. Large files may have a brief delay.

---

## Feature Comparison

| Feature | Activation | Configuration | Performance Impact |
|---------|-----------|---------------|-------------------|
| Navigation | Keyboard/Menu | Name matching rules | Low |
| SQL Interceptor | Auto/Manual | Listen mode, rules | Medium |
| Code Completion | Typing `#{` | Smart completion | Low |
| Code Generation | Keyboard/Menu | Templates | Low |
| Formatting | Command | Dialect, style | Low |
| CodeLens | Automatic | Enable/disable | Low |

---

*Last updated: 2026-03-25*
