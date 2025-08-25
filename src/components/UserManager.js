// Mock user manager for local development
export const kc = {
    hasRealmRole: () => true,
    token: 'mock-token'
};

export const getUser = (callback) => {
    const mockUser = {
        id: "mock-user-id",
        display: "Mock User",
        username: "mockuser",
        name: "Mock User",
        email: "mock@example.com",
        roles: ["shidur_root"]
    };
    callback(mockUser);
};

export default kc;
