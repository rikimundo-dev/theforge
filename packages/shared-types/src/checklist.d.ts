export interface ChecklistResult {
    complete: boolean;
    items: Array<{
        key: string;
        present: boolean;
        value?: unknown;
    }>;
}
