# MyBatis Helper - Troubleshooting Guide

This guide helps you resolve common issues with the MyBatis Helper VS Code extension.

---

## Table of Contents

1. [Navigation Not Working](#navigation-not-working)
2. [SQL Not Appearing in History](#sql-not-appearing-in-history)
3. [Performance Issues on Large Projects](#performance-issues-on-large-projects)
4. [Configuration Problems](#configuration-problems)
5. [Extension Not Activating](#extension-not-activating)
6. [CodeLens Not Showing](#codelens-not-showing)

---

## Navigation Not Working

### Problem: Jump to XML/Java commands do nothing

#### Check 1: Java Extension Installed

MyBatis Helper requires the Red Hat Java extension (`redhat.java`).

**Solution:**
1. Open Extensions panel (`Ctrl+Shift+X`)
2. Search for "Extension Pack for Java"
3. Install if not present
4. Reload VS Code

#### Check 2: File Type Detection

**Solution:**
1. Check the language mode in the bottom-right corner of VS Code
2. For Java files: Should show "Java"
3. For XML files: Should show "XML" or "MyBatis XML"
4. If incorrect, click and select the correct language mode

#### Check 3: Mapper Detection

The extension needs to recognize your file as a Mapper.

**Solution:**
1. Ensure your Java interface follows naming conventions (`*Mapper.java`, `*Dao.java`)
2. Ensure XML file has correct namespace: `<mapper namespace="com.example.UserMapper">`
3. Check that namespace matches the fully qualified class name

#### Check 4: Refresh Mappings

**Solution:**
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run "MyBatis Helper: Refresh Mappings"
3. Wait for indexing to complete

#### Check 5: Custom Project Structure

If your project has non-standard structure:

**Solution:**
Add custom XML directories in settings:
```json
{
  "mybatis-helper.customXmlDirectories": [
    "src/main/resources/custom-mappers",
    "config/mybatis"
  ]
}
```

---

## SQL Not Appearing in History

### Problem: SQL History view is empty

#### Check 1: Log Level Configuration

MyBatis must log at DEBUG level to capture SQL.

**For Spring Boot (application.properties):**
```properties
logging.level.com.example.mapper=DEBUG
logging.level.org.apache.ibatis=DEBUG
```

**For MyBatis XML config:**
```xml
<settings>
    <setting name="logImpl" value="SLF4J"/>
</settings>
```

#### Check 2: Listen Mode

**Solution:**
Try different listen modes in settings:
```json
{
  "mybatis-helper.sqlInterceptor.listenMode": "debugConsole"
}
```

Available modes:
- `auto` - Automatically detect (recommended)
- `debugConsole` - Listen to Debug Console
- `terminal` - Listen to Terminal

#### Check 3: Extension Status

**Solution:**
1. Open MyBatis Helper sidebar (database icon)
2. Check toolbar at the top
3. If showing play button (▶️), click to start interception
4. If showing pause button (⏸️), interception is active

#### Check 4: Log Format

Verify your log format matches one of these:

**Standard MyBatis:**
```
==>  Preparing: SELECT * FROM user WHERE id = ?
==> Parameters: 123(Integer)
```

**With Timestamp:**
```
2024-01-15 10:30:25 DEBUG c.m.UserMapper.selectById - ==>  Preparing: SELECT...
```

If your format differs, add a custom rule in settings.

---

## Performance Issues on Large Projects

### Problem: Slow startup or navigation delays

#### Solution 1: Use Enterprise Scanner

For large/monorepo projects:

```json
{
  "mybatis-helper.scannerMode": "enterprise"
}
```

The Enterprise Scanner uses:
- Worker threads for parsing
- Index caching
- Incremental updates

#### Solution 2: Exclude Large Directories

```json
{
  "mybatis-helper.pathPriority": {
    "enabled": true,
    "priorityDirectories": ["/src/main/"],
    "excludeDirectories": [
      "/node_modules/",
      "/.git/",
      "/build/",
      "/target/",
      "/dist/",
      "/.gradle/"
    ]
  }
}
```

#### Solution 3: Increase VS Code Memory

Add to VS Code settings:
```json
{
  "java.jdt.ls.vmargs": "-XX:+UseParallelGC -XX:GCTimeRatio=4 -XX:AdaptiveSizePolicyWeight=90 -Dsun.zip.disableMemoryMapping=true -Xmx4G -Xms100m"
}
```

#### Solution 4: Disable Unnecessary Features

If you only need specific features:
```json
{
  "mybatis-helper.enableCodeLens": false
}
```

---

## Configuration Problems

### Problem: Invalid configuration or unexpected behavior

#### Check 1: Validate JSON

**Solution:**
1. Open Settings (`Ctrl+,`)
2. Search for "MyBatis Helper"
3. Click icon to open settings.json
4. Validate JSON syntax

#### Check 2: Name Matching Rules

If navigation fails for specific naming patterns:

```json
{
  "mybatis-helper.nameMatchingRules": [
    {
      "name": "Custom Pattern",
      "enabled": true,
      "javaPattern": "*Repository",
      "xmlPattern": "${javaName}Mapper",
      "description": "Match UserRepository.java with UserRepositoryMapper.xml"
    }
  ]
}
```

#### Check 3: Reset to Defaults

**Solution:**
1. Open settings.json
2. Remove all `mybatis-helper.*` entries
3. Reload VS Code
4. Reconfigure as needed

---

## Extension Not Activating

### Problem: MyBatis Helper commands not available

#### Check 1: Activation Events

Extension activates when workspace contains:
- `pom.xml` (Maven)
- `build.gradle` (Gradle)

**Solution:**
If your project uses a different build system, create an empty `pom.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project>
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>my-project</artifactId>
    <version>1.0</version>
</project>
```

#### Check 2: Check Output Panel

**Solution:**
1. Open Output panel (`Ctrl+Shift+U`)
2. Select "MyBatis Helper" from dropdown
3. Check for error messages

#### Check 3: Reload Window

**Solution:**
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run "Developer: Reload Window"

---

## CodeLens Not Showing

### Problem: "Jump to XML" hints not appearing above methods

#### Check 1: CodeLens Enabled

**Solution:**
```json
{
  "mybatis-helper.enableCodeLens": true,
  "editor.codeLens": true
}
```

#### Check 2: File Type

CodeLens only appears in:
- Java Mapper interfaces
- Files matching `*Mapper.java` or `*Dao.java`

#### Check 3: Valid Mapping Exists

CodeLens only shows when:
1. Java file has valid namespace
2. Corresponding XML file exists
3. Method has matching SQL id in XML

**To verify:**
1. Try manual navigation (`Ctrl+Alt+J`)
2. If manual works but CodeLens doesn't, reload window

---

## Getting More Help

If issues persist:

1. **Check Output Logs:**
   - Open Output panel (`Ctrl+Shift+U`)
   - Select "MyBatis Helper"
   - Look for error messages

2. **Enable Debug Logging:**
   ```json
   {
     "mybatis-helper.logOutputLevel": "debug"
   }
   ```

3. **Report Issues:**
   - GitHub: https://github.com/Greenplumwine/vscode-mybatis-helper/issues
   - Include VS Code version, extension version, and relevant logs

4. **Try Sample Project:**
   - Open `samples/basic-mybatis-project/` from this repository
   - Verify features work in the sample
   - Compare configuration with your project

---

*Last updated: 2026-03-25*
