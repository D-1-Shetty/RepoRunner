const extractGithubInfo = (url) => {
  const normalizedUrl = url.trim().replace(/\.git$/, "");

  const parts = normalizedUrl.split("/");

  return {
    owner: parts[3],
    repo: parts[4],
  };
};

export default extractGithubInfo;