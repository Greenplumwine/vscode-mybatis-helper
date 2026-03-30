import { extractTableNameFromMethod, camelToSnakeCase, removePrefix } from '../stringUtils';

describe('stringUtils', () => {
    describe('camelToSnakeCase', () => {
        it('should convert camelCase to snake_case', () => {
            expect(camelToSnakeCase('userName')).toBe('user_name');
            expect(camelToSnakeCase('userId')).toBe('user_id');
            expect(camelToSnakeCase('orderItemList')).toBe('order_item_list');
        });

        it('should handle PascalCase', () => {
            expect(camelToSnakeCase('UserName')).toBe('user_name');
            expect(camelToSnakeCase('UserId')).toBe('user_id');
        });

        it('should handle empty string', () => {
            expect(camelToSnakeCase('')).toBe('');
        });

        it('should handle single word', () => {
            expect(camelToSnakeCase('user')).toBe('user');
        });
    });

    describe('removePrefix', () => {
        it('should remove prefix case-insensitively by default', () => {
            expect(removePrefix('insertUser', 'insert')).toBe('User');
            expect(removePrefix('InsertUser', 'insert')).toBe('User');
            expect(removePrefix('INSERTUser', 'insert')).toBe('User');
        });

        it('should remove prefix case-sensitively when specified', () => {
            expect(removePrefix('insertUser', 'insert', false)).toBe('User');
            expect(removePrefix('InsertUser', 'insert', false)).toBe('InsertUser');
        });

        it('should return original string if prefix not found', () => {
            expect(removePrefix('updateUser', 'insert')).toBe('updateUser');
        });

        it('should handle empty strings', () => {
            expect(removePrefix('', 'insert')).toBe('');
            expect(removePrefix('user', '')).toBe('user');
        });
    });

    describe('extractTableNameFromMethod', () => {
        it('should extract table name from findBy methods', () => {
            expect(extractTableNameFromMethod('findByUserIdAndStatus')).toBe('user');
            expect(extractTableNameFromMethod('findById')).toBe('');
        });

        it('should extract table name from selectBy methods', () => {
            expect(extractTableNameFromMethod('selectUserById')).toBe('user');
            expect(extractTableNameFromMethod('selectUserOrderByUserId')).toBe('user_order');
        });

        it('should extract table name from get methods', () => {
            expect(extractTableNameFromMethod('getUserById')).toBe('user');
            expect(extractTableNameFromMethod('getUserOrderListByUserId')).toBe('user_order');
        });

        it('should extract table name from insert methods', () => {
            expect(extractTableNameFromMethod('insertUser')).toBe('user');
            expect(extractTableNameFromMethod('insertUserOrder')).toBe('user_order');
        });

        it('should extract table name from update methods', () => {
            expect(extractTableNameFromMethod('updateUser')).toBe('user');
            expect(extractTableNameFromMethod('updateUserById')).toBe('user');
        });

        it('should extract table name from delete methods', () => {
            expect(extractTableNameFromMethod('deleteUser')).toBe('user');
            expect(extractTableNameFromMethod('deleteById')).toBe('');
        });

        it('should extract table name from count methods', () => {
            expect(extractTableNameFromMethod('countUser')).toBe('user');
            expect(extractTableNameFromMethod('countByStatus')).toBe('');
        });

        it('should handle List suffix', () => {
            expect(extractTableNameFromMethod('getUserList')).toBe('user');
            expect(extractTableNameFromMethod('selectUserOrderList')).toBe('user_order');
        });

        it('should handle query and search prefixes', () => {
            expect(extractTableNameFromMethod('queryUserById')).toBe('user');
            expect(extractTableNameFromMethod('searchUserByName')).toBe('user');
        });

        it('should return original method name if no prefix matches', () => {
            expect(extractTableNameFromMethod('customMethod')).toBe('custom_method');
        });
    });
});
