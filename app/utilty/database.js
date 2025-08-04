import mongoose from 'mongoose';


let isConnected = false;

export async function connectDatabase() {
    try {
        if (isConnected) {
            return;
        }

        // Check if MONGODB_URI is available
        if (!process.env.MONGODB_URI) {
            console.warn('MONGODB_URI not found. Using in-memory database for development.');
            // For development, we'll use a local MongoDB or skip connection
            // You can set up a local MongoDB or use MongoDB Atlas
            throw new Error('MONGODB_URI environment variable is required. Please set it in your environment variables.');
        }

        const connection = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        isConnected = true;
        console.log('Connected to MongoDB');
        
        // Handle connection errors
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
            isConnected = false;
        });

        return connection;
    } catch (error) {
        isConnected = false;
        console.error('Database connection failed:', error);
        throw error;
    }
}

// Handle connection events
mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
    isConnected = false;
});

mongoose.connection.on('connected', () => {
    console.log('MongoDB connected');
});

mongoose.connection.on('connecting', () => {
    console.log('Connecting to MongoDB...');
});

// Handle process termination
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
});

export { connectDatabase as connectToDatabase }; 