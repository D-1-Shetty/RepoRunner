import api from "./api";

export const getDeployment = async (deploymentId) => {
  const response = await api.get(
    `/deployments/${deploymentId}`
  );

  return response.data;
};

export const getRepositoryDeployments = async (repositoryId) => {
  const response = await api.get(
    `/deployments/repository/${repositoryId}`
  );

  return response.data;
};