import axios from "axios";
import {compareAsc} from "date-fns";
import {z} from "zod";

const rlClientId = process.env.EPIC_CLIENT as string;
const rlSecret = process.env.EPIC_SECRET as string;

export const DateSchema = z.preprocess(arg => {
    if (typeof arg === "string") {
        return new Date(arg);
    }
    return arg;
}, z.date());

export const EpicLinkedAccountSchema = z.object({
    identityProviderId: z.enum(["xbl", "psn", "steam", "nintendo"]),
    accountId: z.string(),
    displayName: z.string().optional(),
});

export const EpicProfileSchema = z.object({
    accountId: z.string(),
    displayName: z.string(),
    preferredLanguage: z.string(),
    linkedAccounts: EpicLinkedAccountSchema.array(),
    empty: z.boolean(),
});

export type EpicProfile = z.infer<typeof EpicProfileSchema>;

export const EpicAccessTokenSchema = z.object({
    token_type: z.literal("bearer"),
    access_token: z.string(),
    expires_in: z.number(),
    expires_at: DateSchema,
    client_id: z.string(),
    application_id: z.string(),
});

export function xboxIdToBC(xboxId: string): string {
    const idHex = ("0000" + parseInt(xboxId).toString(16)).slice(-16);
    return idHex
        .split(/(?=(?:..)*$)/)
        .reverse()
        .join("");
}

export function bcToXboxId(bcId: string): string {
    const hexGroups = bcId.split(/(?=(?:..)*$)/);
    const join = hexGroups.reverse().join("");
    return parseInt(join, 16).toString(10);
}

class EpicServiceClass {
    private readonly tokenEndpoint = "https://api.epicgames.dev/epic/oauth/v1/token";

    private readonly accountsEndpoint = "https://api.epicgames.dev/epic/id/v1/accounts";

    private readonly accessTokens: Record<string, {expiration: Date; token: string} | undefined> = {};

    private async getAccessToken(clientId: string, secret: string): Promise<string> {
        const cachedToken = this.accessTokens[clientId];
        if (cachedToken && compareAsc(cachedToken.expiration, new Date()) > 0) return cachedToken.token;

        const basicAuthToken = Buffer.from(`${clientId}:${secret}`).toString("base64");
        const accessTokenRequest = await axios.post(
            this.tokenEndpoint,
            {
                grant_type: "client_credentials",
            },
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `basic ${basicAuthToken}`,
                },
            },
        );

        const accessToken = EpicAccessTokenSchema.safeParse(accessTokenRequest.data);
        if (!accessToken.success) throw new Error("Failed to fetch bearer token");

        this.accessTokens[clientId] = {
            expiration: accessToken.data.expires_at,
            token: accessToken.data.access_token,
        };
        return accessToken.data.access_token;
    }

    private async getRLToken(): Promise<string> {
        return this.getAccessToken(rlClientId, rlSecret);
    }

    async getProfile(
        data:
            | {displayName: string}
            | {accountId: string}
            | {identityProviderId: "xbl" | "steam" | "psn"; externalAccountId: string},
    ): Promise<EpicProfile | null> {
        const params = new URLSearchParams(data);
        const profileRequest = await axios.get(`${this.accountsEndpoint}?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${await this.getRLToken()}`,
            },
        });

        const epicProfile = EpicProfileSchema.array().safeParse(profileRequest.data);
        if (!epicProfile.success) console.error(profileRequest.data, epicProfile.error);
        if (!epicProfile.success) throw new Error("Failed to parse profile");

        if (epicProfile.data.length !== 1) return null;
        return epicProfile.data[0];
    }
}

export const EpicService = new EpicServiceClass();
