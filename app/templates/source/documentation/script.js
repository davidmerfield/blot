// Plugin JavaScript for analytics embed code
{{{app_js}}}
{{> toc.js}}
{{> menubar.js}}
{{> next-previous.js}}
{{> multi-lingual.js}}
{{> breadcrumbs.js}}

class PageTransitioner {
    constructor(linkSelector, contentSelector) {
        this.linkSelector = linkSelector;
        this.contentSelector = contentSelector;
        this.pageCache = new Map();
        this.currentXHR = null;
        
        this.init();
    }
    
    init() {
        // Handle link hovers
        document.addEventListener('mouseover', e => {
            const link = e.target.closest(this.linkSelector);
            if (link && link.href) this.prefetch(link.href);
        });
        
        // Handle link clicks
        document.addEventListener('click', e => {
            const link = e.target.closest(this.linkSelector);
            if (link && link.href) {
                e.preventDefault();
                this.navigate(link.href);
            }
        });
        
        // Handle browser back/forward
        window.addEventListener('popstate', e => {
            if (e.state?.url) {
                this.navigate(e.state.url, false);
            }
        });
    }
    
    async prefetch(url) {
        if (this.pageCache.has(url)) return;
        
        try {
            const response = await fetch(url);
            const text = await response.text();
            this.pageCache.set(url, text);
        } catch (err) {
            console.warn('Prefetch failed:', err);
        }
    }
    
    async navigate(url, pushState = true) {
        if (this.currentXHR) {
            this.currentXHR.abort();
        }
        
        const content = document.querySelector(this.contentSelector);
        if (!content) return;
        
        content.classList.add('loading');
        
        try {
            let html;
            
            if (this.pageCache.has(url)) {
                html = this.pageCache.get(url);
            } else {
                const controller = new AbortController();
                this.currentXHR = controller;
                
                const response = await fetch(url, {
                    signal: controller.signal
                });
                html = await response.text();
                this.pageCache.set(url, html);
            }
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const newContent = doc.querySelector(this.contentSelector);
            if (newContent) {
                const scrollPos = window.scrollY;
                
                content.innerHTML = newContent.innerHTML;
                document.title = doc.title;
                
                if (pushState) {
                    history.pushState({ url }, '', url);
                }
                
                // Re-run scripts
                content.querySelectorAll('script').forEach(oldScript => {
                    const newScript = document.createElement('script');
                    Array.from(oldScript.attributes).forEach(attr => {
                        newScript.setAttribute(attr.name, attr.value);
                    });
                    newScript.textContent = oldScript.textContent;
                    oldScript.parentNode.replaceChild(newScript, oldScript);
                });
                
                // remove class 'active' from all links
                document.querySelectorAll('.sidebar a').forEach(link => {
                    link.classList.remove('active');
                });

                // add class 'active' to the current link
                document.querySelectorAll('.sidebar a').forEach(link => {
                    if (link.href === url) {
                        link.classList.add('active');
                    }
                });

                window.scrollTo(0, scrollPos);
                refreshToc();
                renderMultiLingual();
                renderNextPrevious();
                renderBreadcrumbs();
            }
            
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('Navigation failed:', err);
        } finally {
            content.classList.remove('loading');
            this.currentXHR = null;
        }
    }
}

// Initialize with your selectors
new PageTransitioner('.sidebar a', '.main');
