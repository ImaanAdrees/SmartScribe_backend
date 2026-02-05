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
      // Students
      {
        name: "Student user",
        email: "student@sc.com",
        password: "Student123!",
        role: "student",
        transcriptions: 45,
      },
      {
        name: "Alice Johnson",
        email: "alice.johnson@sc.com",
        password: "Student123!",
        role: "student",
        transcriptions: 32,
      },
      {
        name: "Robert Green",
        email: "robert.green@sc.com",
        password: "Student123!",
        role: "student",
        transcriptions: 28,
      },
      {
        name: "Emma Wilson",
        email: "emma.wilson@sc.com",
        password: "Student123!",
        role: "student",
        transcriptions: 56,
      },
      {
        name: "Michael Chen",
        email: "michael.chen@sc.com",
        password: "Student123!",
        role: "student",
        transcriptions: 19,
      },
      // Teachers
      {
        name: "Teacher user",
        email: "teacher@sc.com",
        password: "Teacher123!",
        role: "teacher",
        transcriptions: 89,
      },
      {
        name: "Dr. Sarah Anderson",
        email: "sarah.anderson@sc.com",
        password: "Teacher123!",
        role: "teacher",
        transcriptions: 142,
      },
      {
        name: "Prof. James Martin",
        email: "james.martin@sc.com",
        password: "Teacher123!",
        role: "teacher",
        transcriptions: 107,
      },
      {
        name: "Ms. Patricia Lee",
        email: "patricia.lee@sc.com",
        password: "Teacher123!",
        role: "teacher",
        transcriptions: 95,
      },
      {
        name: "Mr. William Taylor",
        email: "william.taylor@sc.com",
        password: "Teacher123!",
        role: "teacher",
        transcriptions: 78,
      },
      // Other
      {
        name: "Other user",
        email: "other@sc.com",
        password: "Other123!",
        role: "other",
        transcriptions: 32,
      },
      {
        name: "Jessica Brown",
        email: "jessica.brown@sc.com",
        password: "Other123!",
        role: "other",
        transcriptions: 51,
      },
      {
        name: "David Miller",
        email: "david.miller@sc.com",
        password: "Other123!",
        role: "other",
        transcriptions: 22,
      },
      {
        name: "Lisa Garcia",
        email: "lisa.garcia@sc.com",
        password: "Other123!",
        role: "other",
        transcriptions: 43,
      },
      {
        name: "John Rodriguez",
        email: "john.rodriguez@sc.com",
        password: "Other123!",
        role: "other",
        transcriptions: 37,
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
    console.log("  Students:");
    console.log("    • student@sc.com / Student123!");
    console.log("    • alice.johnson@sc.com / Student123!");
    console.log("    • robert.green@sc.com / Student123!");
    console.log("  Teachers:");
    console.log("    • teacher@sc.com / Teacher123!");
    console.log("    • sarah.anderson@sc.com / Teacher123!");
    console.log("    • james.martin@sc.com / Teacher123!");
    console.log("  Other:");
    console.log("    • other@sc.com / Other123!");
    console.log("    • jessica.brown@sc.com / Other123!");
    console.log("    • david.miller@sc.com / Other123!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding users:", error.message);
    process.exit(1);
  }
};

seedUsers();
