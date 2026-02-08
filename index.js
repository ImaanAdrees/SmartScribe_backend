import "./loadenv.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import {createServer} from "http"
import { Server } from "socket.io";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { connect_db } from "./src/config/mongo_connection.js";
import path from "path";
import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";

const app=express();

// Serve static files from uploads folder
app.use("/uploads", express.static(path.join(path.resolve(), "uploads")));
const server = createServer(app);

// Initialize Socket.IO with CORS configuration
const allowedOrigins = [
    process.env.FRONT_URL,              // Next.js Web App (http://localhost:3000)
    process.env.REACT_APP_FRONTEND_URL  // React Native App (http://localhost:8081)
].filter(Boolean);

export const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true,
    },
});

// Socket.IO connection handler
io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // Join user to their personal notification room
    socket.on("join_room", (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined room: user_${userId}`);
    });
    
    socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

connect_db();


app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: (origin, callback) => {
      
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