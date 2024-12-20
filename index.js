const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');
require('dotenv').config();
const OAuth2Service = require('./oauth2'); // Import OAuth2 service
const cron = require('node-cron'); // Import node-cron for scheduling

class AITechBlogAutomation {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        this.sources = [
            'https://www.theverge.com/rss/index.xml',
            'https://arstechnica.com/feed/',
            'https://www.wired.com/feed/',
            'https://venturebeat.com/feed/',
            'https://www.zdnet.com/news/rss.xml',
            'https://www.cnet.com/rss/news/',
            'https://dev.to/feed/',
            'https://medium.com/feed/tag/programming'
        ];

        this.oauth2Service = new OAuth2Service();
        this.blogger = google.blogger({ version: 'v3', auth: this.oauth2Service.oauth2Client });
        this.HISTORY_FILE = path.join(__dirname, 'post-history.json');
    }

    // Fetch topics from RSS feeds
    async fetchFeedTopics() {
        const topics = [];

        for (const sourceUrl of this.sources) {
            try {
                const response = await axios.get(sourceUrl, { timeout: 30000 });
                const extractedTopics = this.extractTopicsFromRSS(response.data);
                topics.push(...extractedTopics);
            } catch (error) {
                console.error(`Error fetching feed from ${sourceUrl}:`, error.message);
            }
        }

        return this.filterUniqueTopics(topics);  // Ensure this method is used here
    }

    // Extract topics from the RSS feed XML data
    extractTopicsFromRSS(xmlData) {
        const topics = [];
        const titleMatches = xmlData.match(/<title>(.*?)<\/title>/g) || [];

        titleMatches.forEach(match => {
            const title = match.replace(/<\/?title>/g, '').trim();
            if (title && !title.toLowerCase().includes('comment')) {
                topics.push(title);
            }
        });

        return topics.slice(0, 10);  // Limit to the top 10 topics
    }

    // Ensure unique topics that have not been posted before
    async filterUniqueTopics(topics) {
        const postHistory = await this.readJsonFile(this.HISTORY_FILE, []);
        const uniqueTopics = topics.filter(topic =>
            !postHistory.includes(this.generateUniqueId(topic))  // Compare unique ID of topics
        );
        return uniqueTopics.slice(0, 5);  // Limit to top 5 new topics
    }

    // Generate a unique ID for a topic (hash the topic title)
    generateUniqueId(text) {
        return crypto.createHash('md5').update(text).digest('hex');
    }

    // Read a JSON file
    async readJsonFile(filepath, defaultValue = []) {
        try {
            const data = await fs.readFile(filepath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return defaultValue;
        }
    }

    // Write data to a JSON file
    async writeJsonFile(filepath, data) {
        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    }

    // AI content generation for a topic
    async generateAIContent(topic) {
        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    { role: "system", content: "You are an expert technical content writer." },
                    { role: "user", content: `Write a comprehensive, original 600-word article about: ${topic}.` }
                ],
                max_tokens: 800
            });

            return response.choices[0].message.content;
        } catch (error) {
            console.error('AI Content Generation Error:', error);
            return null;
        }
    }

    // Post the content to Blogger
    async postToBlogger(topics) {
        // Ensure that the OAuth2 credentials are loaded before posting
        const tokens = await this.oauth2Service.loadTokens();
        if (!tokens) {
            console.error('No tokens available. Please run the OAuth flow first.');
            return;
        }

        // Set the credentials explicitly before making Blogger API calls
        this.oauth2Service.oauth2Client.setCredentials(tokens);

        const postHistory = await this.readJsonFile(this.HISTORY_FILE, []);
        for (const topic of topics) {
            try {
                const aiContent = await this.generateAIContent(topic);
                if (!aiContent) continue;

                // Posting to Blogger
                await this.blogger.posts.insert({
                    blogId: process.env.BLOGGER_BLOG_ID,
                    requestBody: {
                        title: topic,
                        content: aiContent,
                        labels: ['Tech Insights', 'Technology Innovation']
                    }
                });

                postHistory.push(this.generateUniqueId(topic));
                await this.delay(60000); // 1-minute delay between posts
            } catch (error) {
                console.error('Blogger Posting Error:', error.message);
            }
        }

        await this.writeJsonFile(this.HISTORY_FILE, postHistory);
    }

    // Delay helper function (to avoid rate limits)
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Run the automation
    async run() {
        try {
            // Fetch topics from RSS feed
            const topics = await this.fetchFeedTopics();
            console.log("Fetched topics:", topics);

            if (topics.length > 0) {
                // Post to Blogger
                await this.postToBlogger(topics);
                console.log(`Posted ${topics.length} articles.`);
            } else {
                console.log('No new topics found.');
            }
        } catch (error) {
            console.error('Automation failed:', error);
        }
    }
}

// Schedule cron job to run every 4 hours
cron.schedule('0 */4 * * *', async () => {
    console.log('Running blog automation...');
    const automation = new AITechBlogAutomation();
    await automation.run();
});

// Run automation once immediately when the script starts
// if (require.main === module) {
//     const automation = new AITechBlogAutomation();
//     automation.run();
// }
