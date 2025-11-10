# Software Quality

Software development processes often don't explicitly consider quality: we may specify our requirements in terms of user stories, needed functionality, or mocks, leaving quality concerns aside. 

But of course we do _care_ that the output is performant, easy to use, accessible and so on—we just leave that part implicit, assuming that developers will deliver an appropriate level of quality along the relevant dimensions.

This might work out just fine, but often it doesn't. In my experience, mismatched expectations about quality are a common source of friction. But it's not always obvious that's what's behind it, partly because most people's thinking about quality isn't very well organized.

# Quality Requirements

I'll try to clear things up a bit. Quality requirements are usually expressed as _values_. Values are fuzzy, intuitive judgments about a software system, obtained in degree or in part.

Here are some examples: Software might be reliable, or secure, or usable. We might want it to be efficient, fast, or delightful. On the other hand, we might as developers care if it’s maintainable, observable, or testable.

These are all quality values, or quality goals. When I talk about quality requirements, what I mean is: how high quality does our software need to be along a particular dimension, and in what ways?

I'll summarize a few more ideas about quality in this table:

| Functional Requirements | Quality Requirements | 
| --- | --- |
| Specified as a user story | Specified as value judgements |
| Unit, manual, or e2e tests | Verification and monitoring | 
| Similar approaches  | Heterogenous approaches | 
| Tend to be binary  | Admit degrees  |
| Visible, intuitive | Qualitative, hard to measure | 
| Specific | Holistic | 
| Timely | Important not urgent | 

# Talking about Quality

Because quality values are intuitive judgements, it can be helpful to get everyone on the same page about what we mean when we use certain terms.

One way to do that is to use a _quality inventory_. ISO has one defined in ISO-25010. I'll include a humanized version of it below.

You can walk through a quality inventory, or the parts of it that seem relevant, and agree on what that would mean for your team or project. Or make one up! The point is just to get a bit more specific, and get everyone on the same page.

# Quantifying Quality


How would you know if you’ve achieved a certain quality goal? It depends on the goal! You can often find a variety of leading or lagging indicators of quality, or perform activities that verify quality.

For example, suppose we want our software to be visually appealing. Consider it holistically:

- *Leading indicators:* Did we have enough design resourcing for the project? Did we produce high-fidelity mocks? Does the designer think they’re good enough?
    
- *Lagging indicators:* Do users complain about the UI in support or on forums? Is it mentioned positively or negatively in sales?
    
- *Verification:* We might try to take the visual design through an internal design review, or perform user testing

The outcome is not likely to be “yes” or “no”—remember, values are obtained in degree or in part, but thinking through how you might measure or verify quality can help you get concrete about where you are, and help you decide where you want to go.

# Quality Goals Analysis

When there’s a conflict related to quality, teams can perform a quality goals analysis to start addressing the problem: The goal is to get all of the stakeholders on the same page about where our quality stands, how we’d like it to change, and what the rough plan is.

# Running the Analysis

The first step is to schedule a meeting where everyone’s going to be in the same room or zoom. Especially leadership, especially cross-functionally. Then ask people to review this document beforehand: make sure everyone knows what quality is, what values are, and has taken a look through the quality inventory in the Appendix.

If this is your first time, maybe take a minute in the meeting to set the stage for why we’re meeting, and what we’re hoping to achieve. And then walk through the quality inventory, holding each value up in light of your work: how are we doing on functional completeness? What about capacity?

Typically there will be a rough consensus about the top 1-3 quality goals where the team needs to improve. It’s worth pushing leadership to prioritize: everyone should hear from each cross-functional leader about what matters to them most.

Once you’ve got consensus about the goals, leadership is optional. The team’s job is then to take the top N quality goals, and develop a plan for each: what quality work can we schedule that will help improve our situation, and ideally how will we measure the improvement we’re hoping for.

# Following Up

It might be helpful to do a quality goals analysis periodically, or at the beginning of a project. Either way, it’s helpful to schedule a follow-up meeting to check in on the team’s progress against the quality goals. As the world turns, our goals and environment will continue to shift, so it’s worth making sure everyone’s on the same page about what’s changed, and what it means for the team’s work.

# Quality Culture

If a team or organization is functioning well and their output is acceptably high quality, much of this can remain implicit. But there’s usually one or more areas where the team wants to improve. Pairing quality goals analysis with sprint planning can help foster and mature a team’s quality culture.

It can help build the muscle of asking about and thinking about quality goals with every piece of work.

In its successful form, it can give people a way to give voice to a feeling that used to be inexpressible. “I hate it” or “it’s just … bad” can become “Remember when we agreed we needed to improve our user error protection? How about we add an undo option here.”


# Appendix: The ISO 25010 Quality Model (Andrew’s Version)

*Functional Suitability*

Does it get the job done?

-   Functional completeness - Does it do all the things the user needs or expects
    
-   Functional correctness - Does it actually give the expected results
    
-   Functional appropriateness - Does it actually meet the user’s business need
    

*Performance efficiency*

Does it do so efficiently?

-   Time behavior - Response time, latency and throughput vs requirements
    
-   Resource utilization - RAM, CPU, cost, any other resource consumed
    
-   Capacity - Are the limits high enough
    

*Compatibility*

Does it play well with others?

-   Co-existence - Does it disrupt other related systems
    
-   Interoperability - Can it exchange information with other related systems
    

*Usability*

Can the users use it?

-   Appropriateness recognizability - Can users understand when to use it
    
-   Learnability - Can they learn how to use it?
    
-   Operability - Can they operate it?
    
-   User error protection - Are they protected from breaking stuff?
    
-   User interface aesthetics - Is it visually appealing and uncluttered?
    
-   Accessibility - Can it be used by people with a wide range of characteristics?
    

*Reliability*

Does it always work?

-   Maturity - Is it consistently reliable?
    
-   Availability - Can you use it when you need to?
    
-   Fault tolerance - Is it robust to breakages in underlying dependencies?
    
-   Recoverability - If something does break, can you get back to a good state?
    

*Security*

Does it protect your data?

-   Confidentiality - Data can only be accessed by intended people or systems
    
-   Integrity - Data can only be modified in appropriate ways by appropriate actors
    
-   Accountability - Can you tell who did what
    
-   Non-repudiation - Can you tell who did what with reliability
    
-   Authenticity - Are actors who they say they are?
    

*Maintainability*

Is the system easy to work with over time?

-   Modularity - Is it a simple design made of simple components, or a total mess?
    
-   Reusability - Are the components of general utility?
    
-   Analysability - Can you predict or understand system behavior in different environments?
    
-   Modifiability - Can you change it without breaking everything
    
-   Testability - Can you test it?
    

*Portability*

Does it work in a variety of environments?

-   Adaptability - Can you extend it to fit in novel environments
    
-   Installability - Can you install or uninstall it?
    
-   Replaceability - Can it swap nicely with an existing system
