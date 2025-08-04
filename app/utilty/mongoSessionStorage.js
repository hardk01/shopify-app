import { Session as ShopifySession } from '@shopify/shopify-api';
import { connectDatabase } from "./database";
import { Session } from "../models/Session";

export class MongoSessionStorage {
  constructor() {
    this.tableName = 'Session';
  }

  async storeSession(session) {
    try {
      await connectDatabase();
      // Use upsert to avoid duplicate key errors
      await Session.updateOne(
        { id: session.id },
        {
          $set: {
            shop: session.shop,
            state: session.state,
            isOnline: session.isOnline,
            scope: session.scope,
            expires: session.expires,
            accessToken: session.accessToken,
            userId: session.userId,
            firstName: session.firstName,
            lastName: session.lastName,
            email: session.email,
            accountOwner: session.accountOwner,
            locale: session.locale,
            collaborator: session.collaborator,
            emailVerified: session.emailVerified
          }
        },
        { upsert: true }
      );
      return true;
    } catch (error) {
      console.error('Error storing session:', error);
      throw error;
    }
  }

  async loadSession(id) {
    try {
      await connectDatabase();
      const session = await Session.findOne({ id });
      if (!session) {
        return undefined;
      }
      // Convert Mongoose doc to plain object
      const sessionObj = session.toObject();
      // Recreate Shopify Session instance
      const shopifySession = new ShopifySession(sessionObj.id, sessionObj.shop, sessionObj.isOnline);
      Object.assign(shopifySession, sessionObj);
      return shopifySession;
    } catch (error) {
      console.error('Error loading session:', error);
      throw error;
    }
  }

  async deleteSession(id) {
    try {
      await connectDatabase();
      await Session.deleteOne({ id });
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }

  async deleteSessions(ids) {
    try {
      await connectDatabase();
      await Session.deleteMany({ id: { $in: ids } });
      return true;
    } catch (error) {
      console.error('Error deleting sessions:', error);
      throw error;
    }
  }

  async findSessionsByShop(shop) {
    try {
      await connectDatabase();
      const sessions = await Session.find({ shop });
      return sessions.map(session => ({
        id: session.id,
        shop: session.shop,
        state: session.state,
        isOnline: session.isOnline,
        scope: session.scope,
        expires: session.expires,
        accessToken: session.accessToken,
        userId: session.userId,
        firstName: session.firstName,
        lastName: session.lastName,
        email: session.email,
        accountOwner: session.accountOwner,
        locale: session.locale,
        collaborator: session.collaborator,
        emailVerified: session.emailVerified
      }));
    } catch (error) {
      console.error('Error finding sessions by shop:', error);
      throw error;
    }
  }
} 