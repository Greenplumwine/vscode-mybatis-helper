import { templateEngine, TemplateEngine } from "../template/templateEngine";
import { TemplateType, TemplateContext } from "../types";

describe("templateEngine", () => {
  describe("Select Method Template", () => {
    it("should generate select with WHERE clause for findBy method", () => {
      const context: TemplateContext = {
        methodName: "findByUserIdAndStatus",
        returnType: "User",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain("SELECT * FROM user");
      expect(result.content).toContain("WHERE user_id = ? AND status = ?");
      expect(result.content).toContain('resultMap="UserResultMap"');
    });

    it("should generate select with LIKE operator", () => {
      const context: TemplateContext = {
        methodName: "findByNameLike",
        returnType: "User",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain("name LIKE ?");
    });

    it("should generate select with BETWEEN operator", () => {
      const context: TemplateContext = {
        methodName: "findByAgeBetween",
        returnType: "User",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain("age BETWEEN ? AND ?");
    });

    it("should generate select with IN operator", () => {
      const context: TemplateContext = {
        methodName: "findByIdIn",
        returnType: "User",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain("id IN (...)");
    });

    it("should generate select with IS NULL operator", () => {
      const context: TemplateContext = {
        methodName: "findByNameIsNull",
        returnType: "User",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain("name IS NULL");
    });

    it("should generate select with IS NOT NULL operator", () => {
      const context: TemplateContext = {
        methodName: "findByNameIsNotNull",
        returnType: "User",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain("name IS NOT NULL");
    });

    it("should generate select with comparison operators", () => {
      const context: TemplateContext = {
        methodName: "findByScoreGreaterThan",
        returnType: "User",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain("score > ?");
    });

    it("should use resultType for primitive return types", () => {
      const context: TemplateContext = {
        methodName: "countByStatus",
        returnType: "int",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('resultType="int"');
      expect(result.content).not.toContain("resultMap");
    });

    it("should use resultType for String return type", () => {
      const context: TemplateContext = {
        methodName: "selectNameById",
        returnType: "String",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('resultType="String"');
    });

    it("should use resultMap for complex return types", () => {
      const context: TemplateContext = {
        methodName: "selectById",
        returnType: "com.example.User",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('resultMap="UserResultMap"');
    });

    it("should use resultMap for List with complex generic type", () => {
      const context: TemplateContext = {
        methodName: "selectAll",
        returnType: "List<User>",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('resultMap="UserResultMap"');
    });

    it("should use resultType for List with simple generic type", () => {
      const context: TemplateContext = {
        methodName: "selectAllIds",
        returnType: "List<String>",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('resultType="String"');
    });

    it("should handle method without By clause", () => {
      const context: TemplateContext = {
        methodName: "selectAll",
        returnType: "List<User>",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain("SELECT * FROM");
      expect(result.content).toContain("WHERE");
    });

    it("should escape XML special characters in method name", () => {
      const context: TemplateContext = {
        methodName: "selectByName<Test>",
        returnType: "User",
      };

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain("selectByName&lt;Test&gt;");
    });
  });

  describe("Insert Method Template", () => {
    it("should generate insert template", () => {
      const context: TemplateContext = {
        methodName: "insertUser",
        parameters: [{ name: "user", type: "User" }],
      };

      const result = templateEngine.render(TemplateType.INSERT_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('<insert id="insertUser"');
      expect(result.content).toContain("INSERT INTO user");
      expect(result.content).toContain('parameterType="User"');
    });
  });

  describe("Update Method Template", () => {
    it("should generate update template", () => {
      const context: TemplateContext = {
        methodName: "updateUserById",
        parameters: [{ name: "user", type: "User" }],
      };

      const result = templateEngine.render(TemplateType.UPDATE_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('<update id="updateUserById"');
      expect(result.content).toContain("UPDATE user");
      expect(result.content).toContain("<set>");
    });
  });

  describe("Delete Method Template", () => {
    it("should generate delete template", () => {
      const context: TemplateContext = {
        methodName: "deleteById",
        parameters: [{ name: "id", type: "Long" }],
      };

      const result = templateEngine.render(TemplateType.DELETE_METHOD, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('<delete id="deleteById"');
      expect(result.content).toContain("DELETE FROM");
    });
  });

  describe("ResultMap Template", () => {
    it("should generate resultMap template", () => {
      const context: TemplateContext = {
        methodName: "BaseResultMap",
        returnType: "com.example.User",
      };

      const result = templateEngine.render(TemplateType.RESULT_MAP, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain(
        '<resultMap id="BaseResultMap" type="com.example.User">',
      );
      expect(result.content).toContain('<id column="id" property="id" />');
    });
  });

  describe("Mapper XML Template", () => {
    it("should generate mapper XML template", () => {
      const context: TemplateContext = {
        namespace: "com.example.mapper.UserMapper",
      };

      const result = templateEngine.render(TemplateType.MAPPER_XML, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain("<!DOCTYPE mapper");
      expect(result.content).toContain(
        'namespace="com.example.mapper.UserMapper"',
      );
    });

    it("should use default namespace if not provided", () => {
      const context: TemplateContext = {};

      const result = templateEngine.render(TemplateType.MAPPER_XML, context);
      expect(result.success).toBe(true);
      expect(result.content).toContain('namespace="com.example.mapper"');
    });
  });

  describe("Error Handling", () => {
    it("should fail for missing methodName in SQL templates", () => {
      const context: TemplateContext = {};

      const result = templateEngine.render(TemplateType.SELECT_METHOD, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain("methodName is required");
    });

    it("should fail for unknown template type", () => {
      const context: TemplateContext = {};

      const result = templateEngine.render(
        "unknownType" as TemplateType,
        context,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown template type");
    });
  });

  describe("TemplateEngine Singleton", () => {
    it("should return same instance", () => {
      const instance1 = TemplateEngine.getInstance();
      const instance2 = TemplateEngine.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
});
