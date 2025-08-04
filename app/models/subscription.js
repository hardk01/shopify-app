import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
    shopId: {
        type: String,
        required: true,
        index: true
    },
    shopifyChargeId: {
        type: String,
        required: false
    },
    shopifySubscriptionId: {
        type: String,
        required: false
    },
    accessToken: {
        type: String,
        required: true
    },
    plan: {
        type: String,
        enum: ['FREE', 'SHOP PLAN', 'WAREHOUSE PLAN', 'FACTORY PLAN', 'FRANCHISE PLAN', 'CITADEL PLAN'],
        default: 'FREE'
    },
    status: {
        type: String,
        enum: ['active', 'cancelled', 'suspended', 'pending'],
        default: 'active'
    },
    installDate: {
        type: Date,
        default: Date.now
    },
    nextBillingDate: {
        type: Date
    },
    currentPeriodEnd: {
        type: Date
    },
    importCount: {
        type: Number,
        default: 0
    },
    exportCount: {
        type: Number,
        default: 0
    },
    // Image processing usage tracking
    imageCompressCount: {
        type: Number,
        default: 0
    },
    webPConvertCount: {
        type: Number,
        default: 0
    },
    altTextCount: {
        type: Number,
        default: 0
    },
    allowedPlatforms: {
        type: [String],
        default: ['Shopify', 'WooCommerce'] // Default for FREE plan
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    renewalDate: {
        type: Date
    },
    test: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Update the updatedAt timestamp before saving
subscriptionSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Method to get plan limits
subscriptionSchema.methods.getPlanLimits = function() {
    const limits = {
        'FREE': {
            importLimit: 20,
            exportLimit: 20,
            imageCompressLimit: 200,
            webPConvertLimit: 50,
            altTextLimit: 50,
            platforms: ['Shopify', 'WooCommerce']
        },
        'SHOP PLAN': {
            importLimit: 100,
            exportLimit: 100,
            imageCompressLimit: 500,
            webPConvertLimit: 200,
            altTextLimit: 500,
            platforms: ['Shopify', 'WooCommerce', 'Wix', 'BigCommerce', 'Squarespace']
        },
        'WAREHOUSE PLAN': {
            importLimit: 300,
            exportLimit: 300,
            imageCompressLimit: 1000,
            webPConvertLimit: 500,
            altTextLimit: 500,
            platforms: ['Shopify', 'WooCommerce', 'Squarespace', 'Amazon', 'Alibaba', 'Custom Sheet']
        },
        'FACTORY PLAN': {
            importLimit: 1000,
            exportLimit: 1000,
            imageCompressLimit: 2000,
            webPConvertLimit: 500,
            altTextLimit: 500,
            platforms: ['Shopify', 'WooCommerce', 'Wix', 'BigCommerce', 'Squarespace', 'Amazon', 'Alibaba', 'Custom Sheet', 'AliExpress', 'Etsy']
        },
        'FRANCHISE PLAN': {
            importLimit: 3000,
            exportLimit: 3000,
            imageCompressLimit: 3000,
            webPConvertLimit: 1000,
            altTextLimit: 1000,
            platforms: ['Shopify', 'WooCommerce', 'Wix', 'BigCommerce', 'Squarespace', 'Amazon', 'Alibaba', 'Custom Sheet', 'AliExpress', 'Etsy', 'Ebay']
        },
        'CITADEL PLAN': {
            importLimit: 50000,
            exportLimit: 50000,
            imageCompressLimit: 5000,
            webPConvertLimit: 5000,
            altTextLimit: 5000,
            platforms: ['Shopify', 'WooCommerce', 'Wix', 'BigCommerce', 'Squarespace', 'Amazon', 'Alibaba', 'Custom Sheet', 'AliExpress', 'Etsy', 'Ebay']
        }
    };
    return limits[this.plan] || limits['FREE'];
};

// Method to check if a platform is allowed
subscriptionSchema.methods.isPlatformAllowed = function(platform) {
    return this.allowedPlatforms.includes(platform);
};

// Method to check if import/export limits are exceeded
subscriptionSchema.methods.hasExceededLimits = function(type, count) {
    const limits = this.getPlanLimits();
    const currentCount = type === 'import' ? this.importCount : this.exportCount;
    const limit = type === 'import' ? limits.importLimit : limits.exportLimit;
    return currentCount + count > limit;
};

// Method to check if image processing limits are exceeded
subscriptionSchema.methods.hasExceededImageLimits = function(type, count) {
    const limits = this.getPlanLimits();
    let currentCount, limit;
    
    switch(type) {
        case 'compress':
            currentCount = this.imageCompressCount;
            limit = limits.imageCompressLimit;
            break;
        case 'webp':
            currentCount = this.webPConvertCount;
            limit = limits.webPConvertLimit;
            break;
        case 'alt':
            currentCount = this.altTextCount;
            limit = limits.altTextLimit;
            break;
        default:
            return false;
    }
    
    return currentCount + count > limit;
};

// Method to get remaining quota
subscriptionSchema.methods.getRemainingQuota = function(type) {
    const limits = this.getPlanLimits();
    let currentCount, limit;
    
    switch(type) {
        case 'import':
            currentCount = this.importCount;
            limit = limits.importLimit;
            break;
        case 'export':
            currentCount = this.exportCount;
            limit = limits.exportLimit;
            break;
        case 'compress':
            currentCount = this.imageCompressCount;
            limit = limits.imageCompressLimit;
            break;
        case 'webp':
            currentCount = this.webPConvertCount;
            limit = limits.webPConvertLimit;
            break;
        case 'alt':
            currentCount = this.altTextCount;
            limit = limits.altTextLimit;
            break;
        default:
            return 0;
    }
    
    return Math.max(0, limit - currentCount);
};

// Method to increment import/export counts
subscriptionSchema.methods.incrementCount = async function(type, count = 1) {
    if (type === 'import') {
        this.importCount += count;
    } else if (type === 'export') {
        this.exportCount += count;
    }
    return this.save();
};

// Method to increment image processing counts
subscriptionSchema.methods.incrementImageCount = async function(type, count = 1) {
    switch(type) {
        case 'compress':
            this.imageCompressCount += count;
            break;
        case 'webp':
            this.webPConvertCount += count;
            break;
        case 'alt':
            this.altTextCount += count;
            break;
    }
    return this.save();
};

// Method to update allowed platforms based on plan
subscriptionSchema.methods.updateAllowedPlatforms = function() {
    const limits = this.getPlanLimits();
    this.allowedPlatforms = limits.platforms;
    return this.save();
};

export const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema); 