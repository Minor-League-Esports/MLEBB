export enum RetentionOption {
    RETAINABLE = "RETAINABLE",
    FA = "FREE_AGENT",
    FP = "FORMER_PLAYER",
    LASTRESPONSE = "LASTRESPONSE",
}

export const retentionOptions = {
    [RetentionOption.RETAINABLE]: "Retention Eligible",
    [RetentionOption.FA]: "Release to FA",
    [RetentionOption.FP]: "Former Player",
};
