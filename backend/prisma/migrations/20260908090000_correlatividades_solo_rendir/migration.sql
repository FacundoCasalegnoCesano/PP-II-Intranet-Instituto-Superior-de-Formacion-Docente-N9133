UPDATE correlatividades
SET aplica_cursado = FALSE,
    aplica_rendir = TRUE
WHERE aplica_cursado <> FALSE OR aplica_rendir <> TRUE;
