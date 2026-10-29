#!/bin/sh
# Download the source texts into raw/: the Internet Archive's OCR of the three volumes
# (printouts of the marxists.org edition) and the marxists.org indexes, for chapter titles.
set -e
cd "$(dirname "$0")"
mkdir -p raw
for v in I II III; do
  curl -sL -o "raw/vol$v.txt" \
    "https://archive.org/download/KarlMarxCapitalVolumeI-III/Karl%20Marx%20-%20Capital%20%28Volume%20$v%29_djvu.txt"
done
for p in 1867-c1 1885-c2 1894-c3; do
  curl -sL -o "raw/idx-$p.htm" "https://www.marxists.org/archive/marx/works/$p/index.htm"
done
ls -l raw
