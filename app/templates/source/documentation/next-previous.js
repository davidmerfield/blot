document.addEventListener("DOMContentLoaded", renderNextPrevious);

function renderNextPrevious() {
    const current = document.querySelector('.sidebar .active');
    
    if (!current) return;

    const links = document.querySelectorAll('.sidebar a');
    const currentIndex = Array.from(links).indexOf(current);

    const nextIndex = currentIndex + 1;
    const previousIndex = currentIndex - 1;

    if (nextIndex < links.length) {
        const next = links[nextIndex];
        const nextLink = document.querySelector('.next-previous .next');
        nextLink.href = next.href;
        nextLink.querySelector('.title').textContent = next.textContent;
        // show next link
        nextLink.style.display = 'block';
    }

    if (previousIndex >= 0) {
        const previous = links[previousIndex];
        const previousLink = document.querySelector('.next-previous .previous');
        previousLink.href = previous.href;
        previousLink.querySelector('.title').textContent = previous.textContent;
        // show previous link
        previousLink.style.display = 'block';
    }
}