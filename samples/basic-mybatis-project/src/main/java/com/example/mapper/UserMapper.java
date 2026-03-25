package com.example.mapper;

import com.example.model.User;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * UserMapper interface - demonstrates MyBatis Java-XML mapping
 *
 * Features demonstrated:
 * 1. Navigation: Ctrl+Alt+J (Windows/Linux) or Ctrl+Option+J (macOS) to jump to XML
 * 2. Code Generation: Ctrl+Shift+G to generate XML method
 * 3. CodeLens: Click "Jump to XML" above methods
 */
public interface UserMapper {

    /**
     * Find user by ID
     * Try: Ctrl+Alt+J on this method to jump to XML
     */
    User findById(@Param("id") Long id);

    /**
     * Find all users
     * Try: Ctrl+Alt+J on this method to jump to XML
     */
    List<User> findAll();

    /**
     * Insert a new user
     * Try: Ctrl+Alt+J on this method to jump to XML
     */
    int insert(@Param("user") User user);

    /**
     * Update existing user
     * Try: Ctrl+Alt+J on this method to jump to XML
     */
    int update(@Param("user") User user);

    /**
     * Find users by name (partial match)
     * Try: Ctrl+Alt+J on this method to jump to XML
     */
    List<User> findByName(@Param("name") String name);
}
