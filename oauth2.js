const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class OAuth2Service {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'http://localhost:3000' // Redirect URI
        );
    }

    // Step 1: Generate the OAuth2 URL for authorization
    generateAuthUrl() {
        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/blogger']
        });
        console.log('Please visit the following URL to authorize the application:');
        console.log(authUrl);
    }

    // Step 2: Get access token using authorization code
    async getAccessToken(code) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code); // Exchange code for tokens
            this.oauth2Client.setCredentials(tokens);
            console.log('Access Token:', tokens.access_token);
            console.log('Refresh Token:', tokens.refresh_token);

            // Save tokens to a file for future use
            await fs.writeFile(path.join(__dirname, 'tokens.json'), JSON.stringify(tokens));
        } catch (error) {
            console.error('Error while retrieving access token:', error);
        }
    }

    // Step 3: Refresh access token using the refresh token
    async refreshAccessToken() {
        try {
            const tokens = JSON.parse(await fs.readFile(path.join(__dirname, 'tokens.json'))); // Read saved tokens
            this.oauth2Client.setCredentials(tokens);

            const { credentials } = await this.oauth2Client.refreshAccessToken(); // Refresh the access token
            this.oauth2Client.setCredentials(credentials); // Set the new credentials

            console.log('New Access Token:', credentials.access_token);

            // Update the tokens file with the new access token
            await fs.writeFile(path.join(__dirname, 'tokens.json'), JSON.stringify(credentials));
        } catch (error) {
            console.error('Error while refreshing access token:', error);
        }
    }

    // Helper to load saved tokens
    async loadTokens() {
        try {
            const tokens = JSON.parse(await fs.readFile(path.join(__dirname, 'tokens.json')));
            this.oauth2Client.setCredentials(tokens);
            return tokens;
        } catch (error) {
            console.error('Error loading tokens:', error);
            return null;
        }
    }
}

module.exports = OAuth2Service;

if (require.main === module) {
    // If this file is run directly, execute the OAuth flow
    const oauth2Service = new OAuth2Service();
    oauth2Service.generateAuthUrl();
    // When you have the code from the redirected URL, you can run:
    oauth2Service.getAccessToken('4/0AeanS0ZDbnTOP_-COsLLcOTYgVBfvYMta58E9r0X9OQkA4pd3HPqIJVCiwsfzzYJovxp1g');
}
