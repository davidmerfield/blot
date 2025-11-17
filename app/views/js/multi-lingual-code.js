// Define a dictionary to map language codes to their display names
var dictionary = {
    markdown: 'Markdown',
    html: 'HTML'
};

// For each multilingual code block, generate tabs before the code block and hide all but the first language
document.querySelectorAll('section.multilingual').forEach(function (block, blockIndex) {

    // Create a <ul> element to hold the language tabs
    var tabs = document.createElement('ul');
    tabs.classList.add('lang-tabs');
    
    // Insert the tabs into the block after the last code block
    block.appendChild(tabs);
    
    // Iterate over each <pre> element within the block
    block.querySelectorAll('pre').forEach(function (code, i) {
        var lang = code.getAttribute('lang');
        
        // If it's not the first code block, hide it
        if (i > 0) {
            code.style.display = 'none';
        }
        
        // Trim the whitespace from the code block
        code.textContent = code.textContent.trim();
        
        // Create a <li> element for the tab
        var tab = document.createElement('li');
        
        // Generate a unique ID for the code block
        var id = lang + '-' + blockIndex + '-' + i;
        
        // Get the display name for the language from the dictionary, or use the language code itself if not found
        var text = dictionary[lang] || lang;
        
        // Set the tab's HTML content
        tab.innerHTML = '<a href="#' + id + '">' + text + '</a>';
        
        // Append the tab to the tabs list
        tabs.appendChild(tab);
        
        // Set the ID of the code block
        code.id = id;
    });
    
    // Add a copy button just before the tabs
    // and set the 'data-copy' attribute to the text content of the first code block
    var copy = document.createElement('button');
    // add the html <span class="icon-copy"></span> to the button
    copy.innerHTML = '<span class="icon-copy"></span> Copy';
    copy.classList.add('copy');
    copy.setAttribute('data-copy', block.querySelector('pre').textContent);
    tabs.before(copy);

});

// Make it possible to switch between languages
document.querySelectorAll('.lang-tabs a').forEach(function (tab) {
    tab.addEventListener('click', function (e) {
        e.preventDefault();
        
        // Get the ID of the code block associated with the clicked tab
        var id = tab.getAttribute('href').slice(1);
        
        // Hide all code blocks within the same multilingual block
        tab.parentElement.parentElement.parentElement.querySelectorAll('pre').forEach(function (code) {
            code.style.display = 'none';
        });
        
        // Show the selected code block
        document.getElementById(id).style.display = 'block';
        
        // Remove the 'active' class from all tabs within the same multilingual block
        tab.parentElement.parentElement.querySelectorAll('a').forEach(function (tab) {
            tab.classList.remove('active');
        });

        // Update the copy button's 'data-copy' attribute to the text content of the selected code block
        tab.parentElement.parentElement.parentElement.querySelector('.copy').setAttribute('data-copy', document.getElementById(id).textContent);

        // Add the 'active' class to the clicked tab
        tab.classList.add('active');
    });
});

// Select the first tab by default
document.querySelectorAll('.lang-tabs').forEach(function (tabs) {
    tabs.querySelector('a').click();
});