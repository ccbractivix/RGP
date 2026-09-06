#!/bin/sh
set -eu

LABEL="com.rgp.theater-player"
launchctl print "gui/$(id -u)/$LABEL"
