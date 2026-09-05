document.addEventListener('DOMContentLoaded', () => {
    const menubar = document.querySelector('.menubar');
    const items = [...menubar.children];

    items.forEach(item => {
      // handle index items
      const itemPath = item.dataset.path;
      if (!itemPath) {
        return;
      }
      const depth = itemPath?.split('/').length - 1;
      
      item.dataset.depth = depth;

      const filename = itemPath?.split('/').pop();
      const filenameWithoutExt = filename?.replace(/\.[^.]*$/, '');

      if (filenameWithoutExt?.toLowerCase().endsWith('index')) {
          item.dataset.depth = parseInt(item.dataset.depth) - 1;
      }
    });

    const minDepth = Math.min(...items.map(item => parseInt(item.dataset.depth)).filter(Boolean));
    const delta = minDepth - 1;

    if (delta > 0) {
      items.forEach(item => {
        const currentDepth = parseInt(item.dataset.depth);
        item.dataset.depth = currentDepth - delta;
      });
    }

      // Create nested structure
    const processLevel = (items, depth) => {
      let currentParent = null;
      let currentSubmenu = null;
      
      items.forEach(item => {
        const itemDepth = parseInt(item.dataset.depth);
                
        if (itemDepth === depth) {
          currentParent = item;
          currentSubmenu = null;
        } else if (itemDepth > depth) {
          if (!currentSubmenu) {
            currentSubmenu = document.createElement('ul');
            currentSubmenu.className = 'sub-menu';
            currentParent.appendChild(currentSubmenu);
          }
          currentSubmenu.appendChild(item);
        }
      });
      
      // Process next level
      const submenuItems = menubar.querySelectorAll(`[data-depth="${depth + 1}"]`);
      if (submenuItems.length) {
        processLevel(items, depth + 1);
      }
    };
  
    processLevel(items, 1);
  });