library('knitr')

## FALSE: quick preview (pdf graphs, expressions written in the document)
## TRUE: final tikz figures and png files in output/ (slow)
final <- TRUE

## White frame around each png, in inches (0 for no frame)
pngmargin <- 0.4

## Start from scratch, so removed cards don't leave old images behind
if(final) unlink("output", recursive=TRUE)
unlink("cache", recursive=TRUE)

knit2pdf('generateImages.Rtex')
system('evince generateImages.pdf &')


## Remove latex misc files
file.remove(dir(recursive=TRUE,pattern="\\.(aux|bbl|blg|log|nav|out|snm|toc|vrb|idx|tikz)$"))
unlink("genfig", recursive=TRUE)
