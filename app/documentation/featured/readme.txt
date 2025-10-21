How to feature a new site
-------------------------

1. Append a line to ./sites.txt in the existing format, note the comma after the name:

example.com Julius Caesar, is a politician from Rome

2. Add an image for the site inside the ./avatars folder named for the new host:

example.com.png

3. Run the script to rebuild the list of featured sites in featured.json then commit your changes:

npm run featured


Ideas
-----

Sort the sites by the latest published post?