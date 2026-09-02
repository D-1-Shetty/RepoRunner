import { getDashboardStats } from "../services/dashboard.service.js";

export const dashboardStats = async (req, res, next) => {
  try {
    const stats = await getDashboardStats(req.user._id);

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    next(error);
  }
};