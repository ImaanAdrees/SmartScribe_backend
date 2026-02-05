import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./src/models/User.js";


dotenv.config();

const createAdmin = async () => {
  try {
    // Connect DB
    await mongoose.connect(process.env.DB_URL);
    console.log("MongoDB connected");

    const adminEmail = "admin@smartscribe.com";

    // Check if admin already exists
    const adminExists = await User.findOne({
      email: adminEmail,
      isAdmin: true,
    });

    if (adminExists) {
      console.log("✅ Admin already exists. No changes made.");
      process.exit(0);
    }

    // Create admin
    const admin = await User.create({
      email: adminEmail,
      password: "admin12345", // will be hashed by model
      isAdmin: true,
    });

    console.log("🎉 Admin created successfully:");
    console.log({
      id: admin._id,
      email: admin.email,
      isAdmin: admin.isAdmin,
    });

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin:", error.message);
    process.exit(1);
  }
};

createAdmin();
