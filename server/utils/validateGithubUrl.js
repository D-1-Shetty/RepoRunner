const validateGithubUrl = (url) => {
  const githubRegex =
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/;

  return githubRegex.test(url);
};

export default validateGithubUrl;