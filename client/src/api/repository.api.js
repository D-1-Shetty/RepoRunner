import api from "./api";

export const getRepositories = async () => {
  const response = await api.get("/repositories");

  return response.data;
};