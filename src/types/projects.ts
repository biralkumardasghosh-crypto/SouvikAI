/**
 * A project groups related chat sessions together. Projects are owned by a
 * single user and can contain zero or more chat sessions.
 */
export interface Project {
    id: string;
    userId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}
