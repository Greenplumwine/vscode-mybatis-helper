package com.example.mapper;

import com.example.model.User;
import org.apache.ibatis.io.Resources;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.junit.jupiter.api.*;

import java.io.IOException;
import java.io.InputStream;
import java.io.Reader;
import java.sql.Connection;
import java.sql.Statement;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * UserMapperTest - demonstrates MyBatis testing and SQL interception
 *
 * To see SQL interception in action:
 * 1. Open the MyBatis Helper sidebar (database icon in left activity bar)
 * 2. Run this test with "mvn test" or VS Code Test Explorer
 * 3. Watch SQL statements appear in the SQL History view
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class UserMapperTest {

    private static SqlSessionFactory sqlSessionFactory;
    private SqlSession sqlSession;
    private UserMapper userMapper;

    @BeforeAll
    static void setUpClass() throws IOException {
        // Load MyBatis configuration
        String resource = "mybatis-config.xml";
        InputStream inputStream = Resources.getResourceAsStream(resource);
        sqlSessionFactory = new SqlSessionFactoryBuilder().build(inputStream);
    }

    @BeforeEach
    void setUp() throws Exception {
        sqlSession = sqlSessionFactory.openSession();
        userMapper = sqlSession.getMapper(UserMapper.class);

        // Initialize database schema
        try (Connection conn = sqlSession.getConnection();
             Statement stmt = conn.createStatement()) {
            stmt.execute("CREATE TABLE IF NOT EXISTS users (" +
                    "id BIGINT AUTO_INCREMENT PRIMARY KEY," +
                    "name VARCHAR(100) NOT NULL," +
                    "email VARCHAR(100) NOT NULL)");
        }
    }

    @AfterEach
    void tearDown() {
        if (sqlSession != null) {
            sqlSession.close();
        }
    }

    @Test
    @Order(1)
    @DisplayName("Insert users - watch SQL appear in MyBatis Helper sidebar")
    void testInsert() {
        User user1 = new User(null, "John Doe", "john@example.com");
        User user2 = new User(null, "Jane Smith", "jane@example.com");

        int result1 = userMapper.insert(user1);
        int result2 = userMapper.insert(user2);

        assertEquals(1, result1);
        assertEquals(1, result2);
        assertNotNull(user1.getId());
        assertNotNull(user2.getId());

        sqlSession.commit();

        // SQL will be captured in MyBatis Helper sidebar!
        System.out.println("Inserted users with IDs: " + user1.getId() + ", " + user2.getId());
    }

    @Test
    @Order(2)
    @DisplayName("Find user by ID - demonstrates SELECT with parameter")
    void testFindById() {
        // First insert a user
        User user = new User(null, "Test User", "test@example.com");
        userMapper.insert(user);
        sqlSession.commit();

        // Then find it
        User found = userMapper.findById(user.getId());

        assertNotNull(found);
        assertEquals(user.getName(), found.getName());
        assertEquals(user.getEmail(), found.getEmail());

        // SQL with parameter will be captured!
        System.out.println("Found user: " + found);
    }

    @Test
    @Order(3)
    @DisplayName("Find all users - demonstrates SELECT without parameters")
    void testFindAll() {
        // Insert some users first
        userMapper.insert(new User(null, "User A", "a@example.com"));
        userMapper.insert(new User(null, "User B", "b@example.com"));
        sqlSession.commit();

        List<User> users = userMapper.findAll();

        assertNotNull(users);
        assertTrue(users.size() >= 2);

        // SQL will be captured!
        System.out.println("Found " + users.size() + " users");
    }

    @Test
    @Order(4)
    @DisplayName("Update user - demonstrates UPDATE with object parameter")
    void testUpdate() {
        // Insert a user
        User user = new User(null, "Original Name", "original@example.com");
        userMapper.insert(user);
        sqlSession.commit();

        // Update the user
        user.setName("Updated Name");
        user.setEmail("updated@example.com");
        int result = userMapper.update(user);

        assertEquals(1, result);
        sqlSession.commit();

        // Verify update
        User updated = userMapper.findById(user.getId());
        assertEquals("Updated Name", updated.getName());
        assertEquals("updated@example.com", updated.getEmail());

        // UPDATE SQL will be captured!
        System.out.println("Updated user: " + updated);
    }

    @Test
    @Order(5)
    @DisplayName("Find users by name - demonstrates LIKE query")
    void testFindByName() {
        // Insert users
        userMapper.insert(new User(null, "Alice Johnson", "alice@example.com"));
        userMapper.insert(new User(null, "Bob Johnson", "bob@example.com"));
        userMapper.insert(new User(null, "Charlie Brown", "charlie@example.com"));
        sqlSession.commit();

        List<User> johnsons = userMapper.findByName("Johnson");

        assertNotNull(johnsons);
        assertTrue(johnsons.size() >= 2);

        // LIKE query SQL will be captured!
        System.out.println("Found " + johnsons.size() + " users matching 'Johnson'");
    }
}
