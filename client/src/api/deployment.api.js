import api from "./api";

export const getRepositoryDeployments = async (repositoryId) => {
  const response = await api.get(
    `/deployments/repository/${repositoryId}`
  );

  return response.data;
};