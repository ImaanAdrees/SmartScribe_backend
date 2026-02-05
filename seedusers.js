import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./src/models/User.js";

dotenv.config();

const seedUsers = async () => {
  try {
    // Connect DB
    await mongoose.connect(process.env.DB_URL);
    console.log("✅ MongoDB connected");

    // Dummy users data
    const dummyUsers = [
      {
        name: "Student user",
        email: "student@sc.com",
        password: "Student123!",
        role: "student",
        transcriptions: 45,
      },
      {
        name: "Teacher user",
        email: "teacher@sc.com",
        password: "Teacher123!",
        role: "teacher",
        transcriptions: 89,
      },
      {
        name: "Other user",
        email: "other@sc.com",
        password: "Other123!",
        role: "other",
        transcriptions: 32,
      },
    ];

    // Check for existing users and filter
    const usersToCreate = [];
    for (const userData of dummyUsers) {
      const userExists = await User.findOne({ email: userData.email });
      if (!userExists) {
        usersToCreate.push(userData);
      }
    }

    if (usersToCreate.length === 0) {
      console.log("ℹ️  All dummy users already exist. No new users created.");
      process.exit(0);
    }

    // Create users
    const createdUsers = await User.insertMany(usersToCreate, {
      validateBeforeSave: true,
    });

    console.log(`\n🎉 ${createdUsers.length} dummy users created successfully:\n`);
    createdUsers.forEach((user) => {
      console.log(
        `  • ${user.name} (${user.email}) - Role: ${user.role} - Transcriptions: ${user.transcriptions}`
      );
    });

    console.log("\n✅ Test credentials:");
    console.log("  Student: john.doe@example.com / Student123!");
    console.log("  Teacher: jane.smith@example.com / Teacher123!");
    console.log("  Other:   mike.johnson@example.com / Other123!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding users:", error.message);
    process.exit(1);
  }
};

seedUsers();
