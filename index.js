import "./loadenv.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import {createServer} from "http"
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { connect_db } from "./src/config/mongo_connection.js";
import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";

const app=express();
const server = createServer(app);
connect_db();

// Increase body parser limit FIRST before other middleware
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS Configuration - Allow both web and mobile apps
const allowedOrigins = [
    process.env.FRONT_URL,              // Next.js Web App (http://localhost:3000)
    process.env.REACT_APP_FRONTEND_URL  // React Native App (http://localhost:8081)
].filter(Boolean); // Remove any undefined values

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

// Trust proxy to get real IP addresses (important for rate limiting)
app.set('trust proxy', 1);

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", notificationRoutes);




server.listen(5000,()=>{console.log("server is listing on port no 5000")})