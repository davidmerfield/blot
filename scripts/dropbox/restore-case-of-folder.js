      // Turns lowercase files and folders in the blogs directory
      // into their real, display case for transition to other clients
      await lowerCaseContents(blogID, { restore: true });
