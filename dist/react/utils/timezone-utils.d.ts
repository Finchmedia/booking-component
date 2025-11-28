export interface TimezoneOption {
    value: string;
    label: string;
    region: string;
}
export declare const getTimezoneOffset: (timezone: string, date?: Date) => string;
export declare const getRegionFromTimezone: (timezone: string) => string;
export declare const getTimezoneDisplayName: (timezone: string) => string;
export declare const getAvailableTimezones: () => TimezoneOption[];
//# sourceMappingURL=timezone-utils.d.ts.map