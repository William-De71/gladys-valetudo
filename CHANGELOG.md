# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-11-03

### Added

- **devices:** one Gladys device per robot vacuum running Valetudo, over its official local REST API: state, run mode (clean, stop, map), back to the dock, battery, suction, water and mode presets, and the remaining life of each consumable, depending on the capabilities of the robot
- **live:** changes pushed by Valetudo (Server-Sent Events), a check every minute for its events, consumables and statistics
- **discovery:** mDNS (`_valetudo._tcp`, through Gladys) and typed addresses; a robot is followed by its Valetudo id when its address changes; optional HTTP Basic authentication
- **scenes:** clean rooms by name or number (passes, suction and water first) and control actions (start, pause, stop, dock, locate, empty the bin, wash or dry the mop); triggers when a cleaning starts or finishes (area, duration), on an error, when the robot needs attention (dust bin full, consumable worn out, mop pad, missing resource, map change), when it stops answering and answers again
- **widgets:** the robot (state, battery, current run, buttons, clean a room), its live map drawn as a picture, and its maintenance (consumables, lifetime statistics, reset)
- **configuration:** "Search and test the robots" button
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README

[0.1.0]: https://github.com/William-De71/gladys-valetudo/releases/tag/v0.1.0
