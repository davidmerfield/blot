# Startup Security

I had the good fortune to lead [Welkin Health's](https://welkinhealth.com/) security program for the first six years of its existence.

In that time, we grew from four people to fifty, built a highly customizable healthcare CRM, and went through the security review process of many of the largest healthcare companies in America. We never suffered a material breach, attained two exceptionless SOC 2 reports, and never lost a deal to security.

I figured it might be helpful to others to lay out a bit of what I've learned and what I'd expect from startups at different stages.

# Mindset

Security's a bit like our physical health. Some people smoke, drink to excess, don't sleep, have every bad habit under the sun and live to a ripe old age. Others live the lives of monks, and still get cancer young. But that doesn't mean we ought to embrace nihilism, stop brushing our teeth, and put unpatched versions of elasticsearch directly on the internet.

Security is about _managing risk_. That means we need to have an idea about what risks we're facing, and then make some informed decisions about what to do.

The Latin root of security means "free from care", and to an extent, that's what a good security program aims towards. It's not so much that you'll be able to make your system "secure" and then suddenly the hackers give up, but that you can say "we thought about it, and we're reasonably confident we're doing the right stuff to protect ourselves".

# Getting Started

When you're just two founders or maybe you have a few other employees, your focus is rightly on making a useful product. Fortunately, it doesn't take a ton of time to handle security at this stage.

First, acknowledge that security is someone's job. Probably it's the CTO, but it might be a security-minded engineer.

Then think about corporate security. You've got a bunch of important accounts—AWS, Twilio, Carta, Gmail, whatever. Use MFA anywhere you can. Adopt a password manager like LastPass. I know it's annoying, but it will save you when you need to access some former employee's account, and will protect you from easy account hijacking.

Consider whether you're going to buy people work laptops. Maybe install some kind of MDM that lets you remote wipe them. JAMF's free edition and Google MDM work fine for this.

Make some kind of checklist for employee onboarding and offboarding and keep it up to date each time you use it. And make sure you're using it—turn off access whenever it's not needed anymore.

Then let's talk about the application and its infrastructure. Your goal is to do as little as possible yourself. If you can use a managed login provider, great! If not, at least use a popular mature framework that gives you sensible sessions and password handling and don't roll your own. Use a mature frontend framework that makes it hard to add huge XSS holes in your app.

Don't put anything directly on the internet if you don't have to—try and keep your servers behind some kind of mature load balancer and make SSH go through a bastion host, or better yet just use some kind of managed platform with good logging that doesn't allow SSH at all.

Spend one afternoon on a risk analysis. It's too early for reading and internalizing all of [NIST 800-30](https://csrc.nist.gov/publications/detail/sp/800-30/rev-1/final), so just keep it simple. Get the engineering team in front of a whiteboard for an hour and brainstorm a bunch of security related risks. Start with the OWASP top 10, and then think about risks that are particular to your application or domain.

Pick the top few and think about whether it makes sense to do something about them. Whether or not you do, send out the notes so you can develop a shared sense of what the risks are. Your and your team's shared understanding of the risks you face is the beginning of a security culture.

Best of luck and talk to you in a year!

# Time to Think

Okay, you've got some paying users, and customers are starting to ask about your security practices. You've got a little more time to think at a 20+ person company. Just kidding! You definitely don't, but you can delegate to one of your senior engineers. Volunteer someone to be "Head of Security".

Now make a recurring meeting with the head of security, the founders, engineering, legal, finance and HR. This is your ORC—the organizational risk committee. For now, the ORC is going to meet to review the risk analysis together.

And we're going to upgrade the risk analysis. It's not so different, but this time make an Airtable base and write down all of your threats. For each one, give it a score for how likely it is to occur, how likely it is to succeed if it did occur, and how high impact it would be if it succeeded. I like using some kind of exponential scale like 1, 3, or 9. Come up with some simple formula for combining likelihood and impact values. Try something like risk = (likelihood of occurrence + likelihood of success)/2 * impact.

Squint at the top N risks. If they don't seem sensible, dig into the numbers and try to bring your intuitions into equilibrium with the data in the sheet—either update the numbers or update the beliefs. Now for each of those top N think about mitigations, and make a business case for or against their prioritization.

Each of those risks gets a slide in the ORC deck. And make sure you include what progress was made on each of those since the last ORC meeting. Execs should be bought into the analysis, and it should cover the kinds of risks they're thinking about. If it doesn't, then there needs to be some more areas added into the process of equilibrium next time around. Send out a summary of the ORC meeting to the company, eliding any sensitive information if necessary.

For corporate security, now your onboarding and offboarding should probably be a bit more formalized. You should have some kind of security awareness training, especially around social engineering and phishing. If you can use Yubikeys or similar unphishable hardware tokens, do so. Note that if you're copying a six digit number into a text box, that's phishable; if you're tapping a device and it's going and checking a certificate, that isn't.

You should probably have MDM set up by now, and maybe a bit more sophisticated monitoring on people's machines. You're requiring hard drive encryption. Maybe you're running OSQuery or some equivalent, and maybe you're managing the binaries people have so you can make sure updates get applied in a timely manner. It's probably a good idea to get a few hours a week from an IT contractor to manage this process.

Maybe you're using an SSO service like Okta and using it for critical services and internal applications. In the ideal case, you're able to put all of your internal services behind an SSO-authenticated load balancer, like an AWS ALB. No SSH, no VPN, no internal services on the internet.

Infrastructure-wise, you've got your cloud provider hooked up to your SSO service, and you have more than one role that your engineers can act as. You have audit logging turned on for everything in your cloud provider, and all of your cloud services. You're tightly managing any open port into your network, and most if not all of your services are not on the internet.

You have some kind of process for checking your dependencies for CVEs. Github has one, there's AuditJS and dependency-check. You're thinking about running a host-based IDS like Threat Stack. You probably pay someone once a year for a penetration test. And you've got some kind of vendor-security checklist to make sure your employees are using reputable tools.

You've got some home-grown security sensitive code in your codebase now. It happens! Put a big comment on top of those files that anyone changing them needs to get a security code review. Make a security design review process, too. It's just a quick meeting early on in any large project to sketch out the security concerns.

Get the engineering team in a room once a month for 30 minutes and do a team brainstorm about what's changed lately that could have security impact. This will likely turn up some issues, and will definitely increase your security awareness on the team.

Put together a disaster recovery plan. Write down what sort of outages you're resilient to and which ones kill the company. Make sure you and execs are comfortable with the level of risk here. Maybe enable cross-region S3 replication.

Lastly, you need an incident response plan. You'll figure out what that needs to be, but it's usually worthwhile to separate out some roles. Someone needs to lead the investigation and someone else should be keeping PR, legal, support, execs etc up to date on what the investigation is learning. And then you'll want to do a postmortem, similar to what you probably already do for an outage.

# Getting Formal

You're now closer to 50 people. Congratulations! A lot of your old processes are broken now. Sales wants to say you're SOC 2 certified. The team doesn't fit in a room anymore for the monthly security brainstorms. Someone installed an NPM package that has a large gif of Guy Fieri embedded in it.

At this point, you're starting to run a real security program. You've thought about hiring Latacora, and if you didn't you at least talked to them. Someone read NIST 800-30, or more importantly [Ryan McGeehan](https://scrty.io/) and now your risk analysis is a bit more complicated. The ORC doesn't really change, but it gets a bit more serious.

SOC 2 is expensive marketing collateral, but is typically a requirement once you start working with large enterprise customers. It'll force you to get a bit more formal with your security processes, too, which isn't all that bad. You're going to get a SOC 2 Type II report. You can either work with a vendor like [Vanta](https://www.vanta.com/) or just pick an auditor that a peer company liked and do a Type I report with them to prepare. It's going to be expensive and time consuming, and involve a decent amount of security theatre, but again you probably don't have a choice.

You probably cobbled together a bunch of security policies to respond to customer security reviews already. Now's the time to get them together into a Security Handbook, copy edit them, and put them in a nice PDF. There are some good open source security policy suites out there for you to get inspiration from [^1][^2][^3][^4].

Switch from all-team brainstorms to running a security advocates program. Volunteer one engineer from each engineering team. Gather the security advocates in a room for two hours every other week and take them through a curriculum on security.

Cover the security mindset, risk analysis and threat modeling, corporate security and vendor management, network security, access controls, application security, infrastructure security, deployment security, the OWASP top 10, and do some CTFs and get experience with hacking tools like Kali Linux. If you do this right, it becomes a prestige assignment, and it's just plain cool. People tend to like the hands-on stuff, too, so be liberal with that.

Make them be the point person for security on their team. They do the first pass at security code and design reviews, and double check with you. They help flag stuff that needs a bit more attention, too. Make it rotational, too, so it doesn't end up being too exclusive. This is maybe the best thing I've found for building security culture and awareness at roughly this size.

I won't go through too much more of the other security boxes to check off at this stage—you know better than I do for your company now, except most of the maybes from the last section aren't maybes anymore.

Towards the end of this phase, you're thinking about hiring full time security engineers, or a CISO. Security is too broad of a specialty to find someone who can cover all of it, so it can often make sense to train your own team in the security disciplines you need. This is often an easy sell to engineers as a professional development opportunity.

# Beyond

Now you've got people to do this full-time and they're going to do a better job of it than I can describe to you. Hopefully when you hired them, they were impressed by how much you'd done, and how the team is already engaged. Hopefully you were able to sell them partly on the basis of the good situation they were about to walk into.

Like I said, you might do everything right here and still suffer from hacking, embarrassment, scams and more. But if you followed along to this point, you can at least be confident you thought hard about it, and you made informed, sensible tradeoffs along the way.

_I am indebted to [Kevin Paik](https://www.linkedin.com/in/kevin-paik-4783392b) for feedback on this essay_.

[^1]: https://www.sans.org/information-security-policy/ 

[^2]: https://github.com/tailscale/policies 

[^3]: https://github.com/strongdm/comply 

[^4]: https://github.com/JupiterOne/security-policy-templates  