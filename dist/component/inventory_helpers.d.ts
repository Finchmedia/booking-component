import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
/** Only these states may release or move an inventory reservation. */
export declare function holdsActiveInventory(status: string): boolean;
export declare function assertPositiveInteger(value: number, label: string): void;
type Capacity = Pick<Doc<"resources">, "quantity" | "isFungible">;
/** Keep the existing one-unit bitmap representation compatible. */
export declare function usesQuantityInventory(resource: Capacity | null): boolean;
export declare function validateResourceCapacity(resource: Capacity): void;
export type ResourceRequest = {
    resourceId: string;
    quantity?: number;
};
export declare function validateResourceRequests(resources: ResourceRequest[]): void;
export declare function validateRequestedQuantity(resource: Capacity | null, quantity: number): void;
export declare function isFungibleResource(ctx: QueryCtx, resourceId: string): Promise<boolean>;
export declare function assertSingleResourceSupported(ctx: QueryCtx, resourceId: string): Promise<void>;
/** Reserve each item in the caller's mutation; a conflict rolls back the whole move. */
export declare function reserveResourceSlots(ctx: MutationCtx, resources: ResourceRequest[], start: number, end: number): Promise<void>;
export {};
//# sourceMappingURL=inventory_helpers.d.ts.map