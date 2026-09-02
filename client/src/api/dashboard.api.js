import api from "./api";

export const getDashboardStats = async () => {
  const { data } = await api.get("/dashboard/stats");
  return data;
};