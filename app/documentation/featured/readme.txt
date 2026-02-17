How to feature a new site
-------------------------

1. Append a line to ./sites.txt in the existing format, note the comma after the name:

example.com Julius Caesar, politician from Rome

   Optionally add a year at the end to set the tenure start date (instead of fetching from the site):

example.com Julius Caesar, politician from Rome, 2019

2. Add an image for the site inside the ./avatars folder named for the new host:

example.com.png

3. Run the script to rebuild the list of featured sites in featured.json then commit your changes (including the regenerated images inside app/views/images/featured/):

npm run featured


Ideas
-----

Sort the sites by the latest published post?