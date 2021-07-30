# TODO

-   If you look in yonder [../src/lib/ui/blessed/patched](https://github.com/moofoo/dnv/tree/main/src/lib/ui/blessed/patched) directory you'll see the extensive mods done to Blessed. Lots of monkey-patching. Not ideal, obviously. My thinking (partly reasonable, partly laziness) is that the monkey-patching was acceptable for the purpose of getting DNV out the door and published, and that at a later date I would pull out the more general changes and do a fork of neo-blessed, including a reasonably stripped-down version of the Terminal widget DNV UI is using. That's the goal at least.

-   Going along with the above: there's a great deal of code cleanup that needs to be done, but a significant chunk of that (in the UI code) would be pointless to do now, if I just ended up moving a bunch of the code to a Blessed fork. So, that should take priority.

-   Is the preuninstall script **_actually_** running?

-   The 'grid' widget is...bad. It's fine for displaying the 2x2 Terminal panels, I guess. I'd like to implement something using Yoga or Apple's autolayout. Should be part of a potential Blessed fork, probably.

-   DNV init functionality that detected package.json files in sub-directories and led the user through prompts to setup 'multi-package' projects (where each directory = separate Node service in the compose .yml file) was commented out. Useful for developing microservices (for example). There are some decisions to be made / issues:

    -   Is this really a needed feature? (The 'feature', more specifically, being DNV generating the Dockerfile and docker-compose.yml).
    -   Such a setup. with a pre-existing Dockerfile / docker-compose.yml, **should** still work, absent those prompts. Need to verify this.

- yarn 3.0 support
