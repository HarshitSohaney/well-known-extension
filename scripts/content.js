// Function to parse the robots.txt file and extract rules for a specific user agent
function parseRobotsTxt(robotsTxt, userAgents) {
  const lines = robotsTxt.split("\n");
  let currentUserAgent = "";
  let rules = {
    "*": { disallow: [], allow: [] },
  };

  userAgents.forEach((agent) => {
    rules[agent] = { disallow: [], allow: [] };
  });
  // Loop through each line in the robots.txt file
  for (let line of lines) {
    line = line.trim().toLowerCase();

    // Identify and set the current User-Agent block
    if (line.startsWith("user-agent:")) {
      currentUserAgent = line.split(":")[1].trim();
    }
    // Add disallow rules if the current userAgent matches or is a wildcard
    else if (
      line.startsWith("disallow:") &&
      (currentUserAgent === "*" || userAgents.includes(currentUserAgent))
    ) {
      const path = line.split(":")[1].trim();
      rules[currentUserAgent].disallow.push(path);
    }
    // Add allow rules if the current userAgent matches or is a wildcard
    else if (
      line.startsWith("allow:") &&
      (currentUserAgent === "*" || userAgents.includes(currentUserAgent))
    ) {
      const path = line.split(":")[1].trim();
      rules[currentUserAgent].allow.push(path);
    }
  }

  // Check if access is completely allowed, blocked, or partially blocked
  const completelyAllowed =
    rules["*"].allow.includes("/") ||
    userAgents.some((agent) => rules[agent].allow.includes("/"));
  const completelyBlocked =
    !completelyAllowed &&
    (userAgents.some((agent) => rules[agent].disallow.includes("/")) ||
      rules["*"].disallow.includes("/"));
  const partiallyBlocked =
    !completelyAllowed &&
    !completelyBlocked &&
    (userAgents.some((agent) => rules[agent].disallow.length > 0) ||
      rules["*"].disallow.length > 0);

  // Return an object with parsed results
  return {
    completelyAllowed,
    completelyBlocked,
    partiallyBlocked,
    specificRules: {
      allow: userAgents.flatMap(agent => rules[agent].allow),
      disallow: userAgents.flatMap(agent => rules[agent].disallow)
    },
    wildcardRules: rules["*"],
  };
}

function validateGPCResponse(gpcResponse) {
  // Make sure the gpc response is a json
  if (gpcResponse && gpcResponse.data) {
    try {
      return JSON.parse(gpcResponse.data);
    } catch (error) {
      return "Not Supported";
    }
  } else {
    return "Not Supported";
  }
}

// Listener for messages sent to the background script
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle "checkRobotsTxt" action
  if (request.action === "checkRobotsTxt") {
    const domain = window.location.hostname;
    const protocol = window.location.protocol;

    // Construct the robots.txt URL
    const robotsTxtUrl = `${protocol}//${domain}/robots.txt`;
    const gpcjsonUrl = `${protocol}//${domain}/.well-known/gpc.json`;

    // Fetch bot configuration from the local config.json file
    fetch(browser.runtime.getURL("config.json"))
      .then((response) => response.json())
      .then((config) => {
        Promise.all([
          browser.runtime.sendMessage({
            action: "fetchWellKnownResource",
            url: robotsTxtUrl,
          }),
          browser.runtime.sendMessage({
            action: "fetchWellKnownResource",
            url: gpcjsonUrl,
          }),
        ]).then(([robotsTxtResponse, gpcjsonResponse]) => {
          // If robots.txt was successfully fetched, parse and send results
          if (robotsTxtResponse.success && robotsTxtResponse.data) {
            const results = {};
            // Parse robots.txt for each bot user agent defined in the config
            config.bots.forEach((bot) => {
              results[bot.name] = parseRobotsTxt(
                robotsTxtResponse.data,
                bot.userAgent
              );
            });

            // Send results, including GPC status, back to the background script
            browser.runtime.sendMessage({
              action: "displayResults",
              data: {
                results: results,
                robotsTxt: robotsTxtResponse.data,
                hostname: domain,
                respects_gpc: validateGPCResponse(gpcjsonResponse),
              },
            });
          } else {
            // If robots.txt could not be fetched, send an error message
            browser.runtime.sendMessage({
              action: "displayResults",
              data: {
                error: "Failed to fetch robots.txt",
              },
            });
          }
        });
      });
  }
});
