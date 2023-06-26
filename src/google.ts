import {google} from "googleapis";
import {join} from "path";

const auth = new google.auth.GoogleAuth({
    keyFile: join(__dirname, "..", "google-auth.json"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

export const sheets = google.sheets({version: "v4", auth: auth});
