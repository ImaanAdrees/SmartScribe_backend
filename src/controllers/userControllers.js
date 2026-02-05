import User from "../models/User.js";

const formatRole = (role) => {
  if (!role) return "Other";
  return role.charAt(0).toUpperCase() + role.slice(1);
};

// Admin: List users
export const listUsers = async (req, res) => {
  try {
    const users = await User.find({ isAdmin: false })
      .select("name email role createdAt transcriptions")
      .sort({ createdAt: -1 });

    const payload = users.map((user) => ({
      id: user._id,
      name: user.name || "Unknown",
      email: user.email,
      role: formatRole(user.role),
      joinDate: user.createdAt ? user.createdAt.toISOString().split("T")[0] : null,
      transcriptions: Number.isFinite(user.transcriptions) ? user.transcriptions : 0,
    }));

    res.json({ users: payload });
  } catch (error) {
    res.status(500).json({ message: "Failed to load users", error: error.message });
  }
};

// Admin: Delete user
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isAdmin) {
      return res.status(403).json({ message: "Cannot delete admin users" });
    }

    await User.deleteOne({ _id: id });

    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user", error: error.message });
  }
};
