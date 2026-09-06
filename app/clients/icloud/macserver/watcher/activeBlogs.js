const BLOG_WATCHER_STATES = {
  STARTING: "starting",
  READY: "ready",
  INACTIVE: "inactive",
};

const blogStates = new Map();

const setState = (blogID, state) => {
  blogStates.set(blogID, state);
};

const markStarting = (blogID) => {
  setState(blogID, BLOG_WATCHER_STATES.STARTING);
};

const markActive = (blogID) => {
  setState(blogID, BLOG_WATCHER_STATES.READY);
};

const markInactive = (blogID) => {
  setState(blogID, BLOG_WATCHER_STATES.INACTIVE);
};

const isActive = (blogID) =>
  blogStates.get(blogID) === BLOG_WATCHER_STATES.READY;

const isStarting = (blogID) =>
  blogStates.get(blogID) === BLOG_WATCHER_STATES.STARTING;

const listActive = () => {
  const activeBlogs = [];

  for (const [blogID, state] of blogStates.entries()) {
    if (state === BLOG_WATCHER_STATES.READY) {
      activeBlogs.push(blogID);
    }
  }

  return activeBlogs;
};

export {
  BLOG_WATCHER_STATES,
  markStarting,
  markActive,
  markInactive,
  isActive,
  isStarting,
  listActive,
};
