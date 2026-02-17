# Free as in Freedom

By 1993, the free software movement was at a crossroads. To the optimistically inclined, all signs pointed toward success for hacker culture. *Wired* magazine—a funky, new publication offering stories on data encryption, Usenet, and software freedom—was flying off magazine racks. The Internet, once a slang term used only by hackers and research scientists, had found its way into mainstream lexicon. Even President Clinton was using it. The personal computer, once a hobbyist’s toy, had grown to full-scale respectability, giving a whole new generation of computer users access to hacker-built software. And while the GNU Project had not yet reached its goal of a fully intact free software operating system, curious users could still try Linux in the interim.

Any way you sliced it, the news was good—or so it seemed. After a decade of struggle, hackers and hacker values were finally gaining acceptance in mainstream society. People were getting it.

Or were they?

## Signs of Trouble Beneath Success

To the pessimistically inclined, each sign of acceptance carried a troubling countersign. Sure, being a hacker was suddenly cool—but was cool good for a community that thrived on alienation? Sure, the White House was saying all the right things about the Internet, even registering its own domain name, *whitehouse.gov*—but it was also meeting with corporations, censorship advocates, and law enforcement officials eager to tame the Internet’s Wild West culture. Sure, PCs were more powerful—but Intel’s commoditization of hardware had shifted power toward proprietary software vendors. For every new user discovering Linux, hundreds—perhaps thousands—were booting Microsoft Windows for the first time.

## The Accidental Nature of Linux

Finally, there was the curious nature of Linux itself. Free from design bugs (like GNU) and legal disputes (like BSD), Linux’s rapid evolution was so unplanned, its success so accidental, that even programmers closest to the code did not know how to interpret it. More compilation album than operating system, Linux was a hacker medley of greatest hits: GCC, GDB, glibc, X, BSD tools such as BIND and TCP/IP, all capped by the Linux kernel—a bored-out, supercharged version of Minix.

Rather than building an operating system from scratch, Linus Torvalds and his collaborators followed the old Picasso adage: *good artists borrow; great artists steal*. Or as Torvalds himself later put it:

> “I’m basically a very lazy person who likes to take credit for things other people actually do.”[^1]

This laziness, admirable from an efficiency standpoint, was troubling politically. Unlike the GNU developers, Torvalds had no ideological agenda. He built Linux not to liberate others, but to entertain himself. Like Tom Sawyer whitewashing a fence, his genius lay in recruitment rather than vision.

## What *Was* Linux?

This success raised an unsettling question: what exactly was Linux? Was it an embodiment of Stallman’s free software philosophy? Or merely a convenient aggregation of tools that anyone could assemble?

By late 1993, many users leaned toward the latter view. Variations—*distributions*—began appearing, some sold commercially. The results were uneven at best.

Ian Murdock, then a Purdue University student, recalls:

> “You’d flip through Unix magazines and see business-card-sized ads proclaiming ‘Linux.’ Most were fly-by-night operations slipping their own source code into the mix.”

Disillusioned, Murdock resolved to create a “pure” distribution composed entirely of free software. He announced his plan on Usenet.

## Stallman Enters the Picture

One of the first replies came from `rms@ai.mit.edu`—Richard M. Stallman.

Stallman wrote that the Free Software Foundation was beginning to look seriously at Linux and was interested in producing a Linux system of its own. This marked a dramatic reversal. Until then, Stallman had largely ignored Linux, dismissing it as non-portable and inferior to BSD.

What he failed to appreciate at first was Linux’s decisive advantage: it was the only freely modifiable operating system available at scale.

While GNU’s HURD kernel languished, Torvalds won developers—and momentum.

## The Window of Opportunity

By 1993, GNU’s inability to deliver a kernel had become a serious liability. A *Wired* article described the project as “bogged down,” despite its tools’ success.[^2] Internally, morale was worse.

> “There was a window of opportunity,” recalls Chassell. “Once it closed, people would lose interest.”[^3]

Critics like Eric Raymond blamed institutional arrogance. Others, including Murdock, cited overambition and microkernel complexity.

Stallman himself pointed to technical difficulties—especially timing errors in asynchronous systems—and organizational dysfunction.[^4]

## Forks, Fractures, and Naming Battles

As Linux flourished, tensions mounted. Though GPL-licensed, Linux was increasingly treated as ideologically neutral. The user base ballooned from a dozen Minix hobbyists to as many as 100,000.[^5]

Stallman likened the moment to watching Soviet troops enter Berlin.[^6]

When the FSF backed Murdock’s project—soon named **Debian**—Stallman requested that it be called **GNU/Linux**. Though controversial, Murdock viewed this as a plea for unity rather than credit.

The deepest conflict centered on **glibc**, the GNU C Library. Overwhelmed by Linux-driven change requests, GNU maintainers fell behind. Some developers proposed forking the library—an act Stallman feared would fracture the movement, as had happened with GNU Emacs and Lucid Emacs.[^8]

## Debian, Distance, and Commercialization

Debian survived, but under Bruce Perens distanced itself from the FSF’s governance style. Linux, meanwhile, surged commercially.

Companies like Red Hat—led by Robert Young—embraced the free software model, seeing business efficiency rather than ideological purity. Young famously misused the term “public domain,”[^9] but his instincts proved prescient.

By 1996, Linux’s dominance was assured. Even had GNU released HURD, few would have noticed.

As Murdock later reflected:

> “Linux might never have happened if the HURD had arrived sooner.”[^10]

The wave had already broken.

Ready or not.


[^1]: Quoted in Eric S. Raymond, *The Cathedral and the Bazaar* (1997).
[^2]: Simson Garfinkel, “Is Stallman Stalled?” *Wired*, March 1993.
[^3]: Personal recollection cited in the original text.
[^4]: Richard Stallman, speech (2000), on timing errors in Mach-based systems.
[^5]: Estimated Linux user counts from Red Hat milestones.
[^6]: Stallman’s later commentary invoking Winston Churchill.
[^7]: Ian Murdock, “The Debian Manifesto” (1994).
[^8]: Jamie Zawinski, “The Lemacs/FSFmacs Schism.”
[^9]: GPL software is copyrighted; it is not public domain.
[^10]: Linus Torvalds, in the Tanenbaum–Torvalds debate (*Open Sources*, 1999).
