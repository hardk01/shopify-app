import { authenticate } from '../shopify.server.js';

export async function registerWebhooks(shop, accessToken) {
    // Removed all log statements for production
    
    const webhooks = [
        {
            topic: 'APP_SUBSCRIPTIONS_UPDATE',
            address: `${process.env.SHOPIFY_APP_URL}/webhooks/subscription`,
            format: 'json'
        },
        {
            topic: 'APP_SUBSCRIPTIONS_CANCEL',
            address: `${process.env.SHOPIFY_APP_URL}/webhooks/subscription`,
            format: 'json'
        },
        {
            topic: 'APP_SUBSCRIPTIONS_PAYMENT_FAILURE',
            address: `${process.env.SHOPIFY_APP_URL}/webhooks/subscription`,
            format: 'json'
        },
        {
            topic: 'APP_UNINSTALLED',
            address: `${process.env.SHOPIFY_APP_URL}/webhooks/app/uninstalled`,
            format: 'json'
        },
        {
            topic: 'APP_SCOPES_UPDATE',
            address: `${process.env.SHOPIFY_APP_URL}/webhooks/app/scopes_update`,
            format: 'json'
        },
        // Mandatory compliance webhooks for public apps
        {
            topic: 'CUSTOMERS_DATA_REQUEST',
            address: `${process.env.SHOPIFY_APP_URL}/webhooks/customers/data_request`,
            format: 'json'
        },
        {
            topic: 'CUSTOMERS_REDACT',
            address: `${process.env.SHOPIFY_APP_URL}/webhooks/customers/redact`,
            format: 'json'
        },
        {
            topic: 'SHOP_REDACT',
            address: `${process.env.SHOPIFY_APP_URL}/webhooks/shop/redact`,
            format: 'json'
        }
    ];

    try {
        // First, get existing webhooks
        const response = await fetch(`https://${shop}/admin/api/2024-01/webhooks.json`, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch existing webhooks: ${response.statusText}`);
        }

        const data = await response.json();
        const existingWebhooks = data.webhooks || [];

        // Delete existing webhooks for our topics
        for (const webhook of existingWebhooks) {
            if (webhooks.some(w => w.topic === webhook.topic)) {
                const deleteResponse = await fetch(`https://${shop}/admin/api/2024-01/webhooks/${webhook.id}.json`, {
                    method: 'DELETE',
                    headers: {
                        'X-Shopify-Access-Token': accessToken,
                        'Content-Type': 'application/json',
                    },
                });
            }
        }

        // Register new webhooks
        for (const webhook of webhooks) {
            const registerResponse = await fetch(`https://${shop}/admin/api/2024-01/webhooks.json`, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ webhook }),
            });
        }
    } catch (error) {
        throw error;
    }
} 