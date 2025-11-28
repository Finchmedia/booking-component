export declare const getResource: import("convex/server").RegisteredQuery<"public", {
    id: string;
}, Promise<{
    _id: import("convex/values").GenericId<"resources">;
    _creationTime: number;
    description?: string | undefined;
    isFungible?: boolean | undefined;
    isStandalone?: boolean | undefined;
    quantity?: number | undefined;
    organizationId: string;
    timezone: string;
    id: string;
    isActive: boolean;
    name: string;
    type: string;
    createdAt: number;
    updatedAt: number;
} | null>>;
export declare const getResourceById: import("convex/server").RegisteredQuery<"public", {
    resourceId: import("convex/values").GenericId<"resources">;
}, Promise<{
    _id: import("convex/values").GenericId<"resources">;
    _creationTime: number;
    description?: string | undefined;
    isFungible?: boolean | undefined;
    isStandalone?: boolean | undefined;
    quantity?: number | undefined;
    organizationId: string;
    timezone: string;
    id: string;
    isActive: boolean;
    name: string;
    type: string;
    createdAt: number;
    updatedAt: number;
} | null>>;
export declare const listResources: import("convex/server").RegisteredQuery<"public", {
    activeOnly?: boolean | undefined;
    type?: string | undefined;
    organizationId: string;
}, Promise<{
    _id: import("convex/values").GenericId<"resources">;
    _creationTime: number;
    description?: string | undefined;
    isFungible?: boolean | undefined;
    isStandalone?: boolean | undefined;
    quantity?: number | undefined;
    organizationId: string;
    timezone: string;
    id: string;
    isActive: boolean;
    name: string;
    type: string;
    createdAt: number;
    updatedAt: number;
}[]>>;
export declare const listResourcesByType: import("convex/server").RegisteredQuery<"public", {
    organizationId: string;
    type: string;
}, Promise<{
    _id: import("convex/values").GenericId<"resources">;
    _creationTime: number;
    description?: string | undefined;
    isFungible?: boolean | undefined;
    isStandalone?: boolean | undefined;
    quantity?: number | undefined;
    organizationId: string;
    timezone: string;
    id: string;
    isActive: boolean;
    name: string;
    type: string;
    createdAt: number;
    updatedAt: number;
}[]>>;
export declare const createResource: import("convex/server").RegisteredMutation<"public", {
    description?: string | undefined;
    isActive?: boolean | undefined;
    isFungible?: boolean | undefined;
    isStandalone?: boolean | undefined;
    quantity?: number | undefined;
    organizationId: string;
    timezone: string;
    id: string;
    name: string;
    type: string;
}, Promise<import("convex/values").GenericId<"resources">>>;
export declare const updateResource: import("convex/server").RegisteredMutation<"public", {
    timezone?: string | undefined;
    description?: string | undefined;
    isActive?: boolean | undefined;
    isFungible?: boolean | undefined;
    isStandalone?: boolean | undefined;
    name?: string | undefined;
    quantity?: number | undefined;
    type?: string | undefined;
    id: string;
}, Promise<import("convex/values").GenericId<"resources">>>;
export declare const deleteResource: import("convex/server").RegisteredMutation<"public", {
    id: string;
}, Promise<{
    success: boolean;
}>>;
export declare const toggleResourceActive: import("convex/server").RegisteredMutation<"public", {
    id: string;
    isActive: boolean;
}, Promise<{
    success: boolean;
    affectedUsers: number;
}>>;
export declare const getResourceAvailability: import("convex/server").RegisteredQuery<"public", {
    resourceId: string;
    date: string;
}, Promise<number[]>>;
export declare const getQuantityAvailability: import("convex/server").RegisteredQuery<"public", {
    resourceId: string;
    date: string;
}, Promise<{
    totalQuantity: number;
    bookedQuantities: any;
}>>;
//# sourceMappingURL=resources.d.ts.map